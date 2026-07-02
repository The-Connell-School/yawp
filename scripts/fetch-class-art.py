#!/usr/bin/env python3
"""Download public-domain class header art from Wikimedia Commons."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "YawpClassArtFetcher/1.0 (local dev; contact: dev@yawp.local)"

# outfile stem -> Wikimedia File: title (exact or search fallback prefix)
ARTWORKS: dict[str, str] = {
    # batch 1 (existing)
    "monet-water-lilies": "Claude Monet - Water Lilies - Google Art Project.jpg",
    "hiroshige-sudden-shower": "Hiroshige, Sudden shower over Shin-Ōhashi bridge and Atake, 1857.jpg",
    "hiroshige-plum-garden": "Ando Hiroshige - Plum Garden, Kameido - Google Art Project.jpg",
    "hokusai-chrysanthemums": "葛飾北斎画 菊に雀-Sparrows and Chrysanthemums MET DP151594.jpg",
    "ohara-koson-cranes": "Koson - two-white-cranes.jpg",
    "cezanne-mont-sainte-victoire": "La Montagne Sainte-Victoire vue de la carrière Bibémus, par Paul Cézanne.jpg",
    "franz-marc-blue-horse": "Marc, Franz - Blue Horse I - Google Art Project.jpg",
    "paul-klee-senecio": "Paul Klee, 1922, Senecio, oil on gauze, 40.3 × 37.4 cm, Kunstmuseum Basel.jpg",
    "kandinsky-composition-viii": "Kandinsky - Composition 8, July 1923.jpg",
    "turner-fighting-temeraire": "The Fighting Temeraire, JMW Turner, National Gallery.jpg",
    "bonnard-dining-room": "The dining room in the country by Pierre Bonnard (1913).jpg",
    "redon-ophelia-flowers": "Odilon Redon, Ophelia among the Flowers, The National Gallery, London.jpg",
    "munch-the-scream": "Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg",
    "seurat-sunday-afternoon": "A Sunday on La Grande Jatte, Georges Seurat, 1884.jpg",
    "degas-dancers": "Edgar Germain Hilaire Degas 021.jpg",
    # batch 2 — school-safe landscapes, nature, ukiyo-e, abstract
    "monet-impression-sunrise": "Claude Monet, Impression, soleil levant, 1872.jpg",
    "monet-japanese-bridge": "Claude Monet - The Japanese Footbridge - Google Art Project.jpg",
    "van-gogh-starry-night": "Van Gogh - Starry Night - Google Art Project.jpg",
    "van-gogh-irises": "Van Gogh - Irises - Google Art Project.jpg",
    "constable-hay-wain": "Constable - The Hay Wain (1821).jpg",
    "bierstadt-yosemite-valley": "Albert Bierstadt - Yosemite Valley - Google Art Project.jpg",
    "cole-the-oxbow": "Thomas Cole - The Oxbow - Google Art Project.jpg",
    "homer-breezing-up": "Winslow Homer - Breezing Up (A Fair Wind) - Google Art Project.jpg",
    "hokusai-moon-beneath-fuji": "Hokusai - Mount Fuji seen from the sea.jpg",
    "hokusai-kirifuri-falls": "Katsushika Hokusai - Kirifuri Waterfall at Kurokami Mountain in Shimotsuke.jpg",
    "hiroshige-whirlpool": "Hiroshige - Naruto Whirlpools - Google Art Project.jpg",
    "hiroshige-tago-bay": "Hiroshige - Tago Bay near Ejiri on the Tokaido - Google Art Project.jpg",
    "mondrian-composition-red-blue-yellow": "Piet Mondrian, Composition with Red, Blue and Yellow, 1930.jpg",
    "paul-klee-castle-and-sun": "Burg und Sonne - Klee.jpg",
    "constable-hay-wain": "John Constable - The Hay Wain (1821).jpg",
    "el-greco-view-of-toledo": "El Greco - View of Toledo - Google Art Project.jpg",
    "canaletto-venice-grand-canal": "Canaletto - The Grand Canal in Venice - Google Art Project.jpg",
    "ohara-koson-kingfisher": "Koson - kingfisher on a branch.jpg",
    "ohara-koson-carp": "Ohara Koson - Carp - Google Art Project.jpg",
    "rousseau-exotic-landscape": "Henri Rousseau - Exotic Landscape - Google Art Project.jpg",
    "georges-seurat-the-channel": "Georges Seurat - The Channel of Gravelines, Petit Fort Philippe - Google Art Project.jpg",
}


def api_get(params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def resolve_download_url(file_title: str, width: int = 1400) -> str:
    title = f"File:{file_title}"
    data = api_get(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": str(width),
        }
    )
    pages = data["query"]["pages"]
    page = next(iter(pages.values()))
    if "missing" in page:
        raise RuntimeError(f"Missing on Commons: {title}")
    info = page["imageinfo"][0]
    return info.get("thumburl") or info["url"]


def search_fallback(query: str) -> str | None:
    data = api_get(
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srnamespace": "6",
            "srlimit": "5",
        }
    )
    hits = data["query"]["search"]
    return hits[0]["title"].removeprefix("File:") if hits else None


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def resize_jpg(src: Path, dest: Path, max_px: int = 1000) -> None:
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-Z", str(max_px), str(src), "--out", str(dest)],
        check=True,
        capture_output=True,
    )


def fetch_one(out_dir: Path, stem: str, file_title: str) -> None:
    dest = out_dir / f"{stem}.jpg"
    if dest.exists():
        print(f"SKIP {dest.name}")
        return

    tmp = out_dir / f".{stem}.tmp"
    try:
        url = resolve_download_url(file_title)
    except RuntimeError:
        fallback = search_fallback(file_title.rsplit(" - ", 1)[0])
        if not fallback:
            fallback = search_fallback(stem.replace("-", " "))
        if not fallback:
            raise
        print(f"FALLBACK {stem}: {fallback}")
        url = resolve_download_url(fallback)

    print(f"FETCH {dest.name} <- {file_title}")
    download(url, tmp)
    resize_jpg(tmp, dest)
    tmp.unlink(missing_ok=True)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "services/web-app/public/img/class-art"
    out_dir.mkdir(parents=True, exist_ok=True)

    failed: list[str] = []
    for i, (stem, title) in enumerate(ARTWORKS.items()):
        if i:
            time.sleep(1.5)
        try:
            fetch_one(out_dir, stem, title)
        except Exception as exc:  # noqa: BLE001 — batch script
            print(f"FAIL {stem}: {exc}", file=sys.stderr)
            failed.append(stem)

    count = len(list(out_dir.glob("*.jpg")))
    print(f"Done: {count} JPGs in {out_dir}")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
