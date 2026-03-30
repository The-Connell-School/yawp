terraform {
  backend "s3" {
    # CI passes -backend-config for each PR, e.g. key = "yawp/pr/pr-123/terraform.tfstate"
  }
}
