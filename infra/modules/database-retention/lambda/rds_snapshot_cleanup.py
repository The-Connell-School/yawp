import logging
import os
from datetime import datetime, timedelta, timezone

import boto3

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

RDS = boto3.client("rds")


def _required_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def _retention_days():
    value = int(_required_env("SNAPSHOT_RETENTION_DAYS"))
    if value < 90:
        raise ValueError("SNAPSHOT_RETENTION_DAYS must be at least 90")
    return value


def _markers():
    raw = os.environ.get("PRE_DEPLOY_SNAPSHOT_MARKERS", "pre-deploy,predeploy")
    return [marker.strip().lower() for marker in raw.split(",") if marker.strip()]


def _snapshot_created_at(snapshot):
    created_at = snapshot.get("SnapshotCreateTime")
    if created_at is None:
        return None
    if created_at.tzinfo is None:
        return created_at.replace(tzinfo=timezone.utc)
    return created_at.astimezone(timezone.utc)


def _snapshot_tags(snapshot):
    arn = snapshot.get("DBSnapshotArn")
    if not arn:
        return {}, False
    try:
        response = RDS.list_tags_for_resource(ResourceName=arn)
    except Exception:
        LOGGER.exception("Failed to read tags for snapshot %s", snapshot.get("DBSnapshotIdentifier"))
        return {}, True
    return {tag.get("Key", ""): tag.get("Value", "") for tag in response.get("TagList", [])}, False


def _is_pre_deploy_snapshot(snapshot, tags, markers):
    snapshot_id = snapshot.get("DBSnapshotIdentifier", "").lower()
    if any(marker in snapshot_id for marker in markers):
        return True

    purpose_values = [
        tags.get("Purpose", ""),
        tags.get("SnapshotPurpose", ""),
        tags.get("yawp:purpose", ""),
    ]
    return any(
        marker in value.strip().lower()
        for value in purpose_values
        for marker in markers
    )


def _manual_snapshots(db_instance_identifier):
    paginator = RDS.get_paginator("describe_db_snapshots")
    for page in paginator.paginate(
        DBInstanceIdentifier=db_instance_identifier,
        SnapshotType="manual",
    ):
        yield from page.get("DBSnapshots", [])


def handler(event, context):
    db_instance_identifier = _required_env("DB_INSTANCE_IDENTIFIER")
    retention_days = _retention_days()
    markers = _markers()
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    inspected = []
    for snapshot in _manual_snapshots(db_instance_identifier):
        tags, tag_read_failed = _snapshot_tags(snapshot)
        inspected.append({
            "snapshot": snapshot,
            "tags": tags,
            "tag_read_failed": tag_read_failed,
            "created_at": _snapshot_created_at(snapshot),
            "is_pre_deploy": _is_pre_deploy_snapshot(snapshot, tags, markers),
        })

    pre_deploy_snapshots = [
        item for item in inspected
        if item["is_pre_deploy"] and item["created_at"] is not None
    ]
    newest_pre_deploy = None
    if pre_deploy_snapshots:
        newest_pre_deploy = max(pre_deploy_snapshots, key=lambda item: item["created_at"])
        LOGGER.info(
            "Preserving newest pre-deploy snapshot %s from %s",
            newest_pre_deploy["snapshot"].get("DBSnapshotIdentifier"),
            newest_pre_deploy["created_at"].isoformat(),
        )

    deleted = []
    skipped = []
    for item in inspected:
        snapshot = item["snapshot"]
        snapshot_id = snapshot.get("DBSnapshotIdentifier")
        created_at = item["created_at"]
        status = snapshot.get("Status")

        if item is newest_pre_deploy:
            skipped.append({"snapshot": snapshot_id, "reason": "newest-pre-deploy"})
            continue
        if item["tag_read_failed"]:
            skipped.append({"snapshot": snapshot_id, "reason": "tag-read-failed"})
            continue
        if created_at is None:
            skipped.append({"snapshot": snapshot_id, "reason": "missing-create-time"})
            continue
        if created_at >= cutoff:
            skipped.append({"snapshot": snapshot_id, "reason": "within-retention"})
            continue
        if status != "available":
            skipped.append({"snapshot": snapshot_id, "reason": f"status-{status}"})
            continue

        LOGGER.info(
            "Deleting manual RDS snapshot %s created at %s; retention is %s days",
            snapshot_id,
            created_at.isoformat(),
            retention_days,
        )
        RDS.delete_db_snapshot(DBSnapshotIdentifier=snapshot_id)
        deleted.append(snapshot_id)

    result = {
        "db_instance_identifier": db_instance_identifier,
        "retention_days": retention_days,
        "cutoff": cutoff.isoformat(),
        "inspected_count": len(inspected),
        "deleted_count": len(deleted),
        "deleted": deleted,
        "skipped": skipped,
    }
    LOGGER.info("Manual RDS snapshot cleanup result: %s", result)
    return result
