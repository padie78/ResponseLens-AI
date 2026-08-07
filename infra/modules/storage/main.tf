variable "name_prefix" {
  type = string
}

# Placeholder bucket for future cold telemetry / exports (S3 → Glue path).
resource "aws_s3_bucket" "data_lake" {
  bucket_prefix = "${var.name_prefix}-lake-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "data_lake" {
  bucket                  = aws_s3_bucket.data_lake.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
