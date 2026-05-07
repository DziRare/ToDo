# Some account info we need for a globally unique bucket name.
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "website" {
  # S3 bucket names are global, so we suffix with the account id to avoid
  # collisions. Change the prefix here if you want a different name.
  bucket        = "todo-site-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# CDK's BUCKET_OWNER_FULL_CONTROL ACL maps to BucketOwnerPreferred ownership.
resource "aws_s3_bucket_ownership_controls" "website" {
  bucket = aws_s3_bucket.website.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# CDK's BLOCK_ACLS sets BlockPublicAcls=true and IgnorePublicAcls=true, but
# leaves BlockPublicPolicy=false so the public-read bucket policy below is
# allowed to take effect.
resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  index_document {
    suffix = "index.html"
  }

  # Optional: serve index.html for unknown paths (useful for SPA-style routing).
  # Uncomment if you ever add client-side routing.
  # error_document {
  #   key = "index.html"
  # }
}

resource "aws_s3_bucket_policy" "website_public_read" {
  bucket = aws_s3_bucket.website.id

  # Wait for the public-access block to be in place so the policy is accepted.
  depends_on = [aws_s3_bucket_public_access_block.website]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.website.arn}/*"
      }
    ]
  })
}

###############################################################################
# Upload the site contents
#
# Walks ../todo-site/ and uploads every file. Re-uploads any file whose MD5
# changes (via the etag), so editing index.html and re-running terraform apply
# pushes the new version.
###############################################################################

locals {
  site_source_dir = "${path.module}/../todo-site"

  # MIME types so the browser renders files correctly. Without these S3
  # serves everything as application/octet-stream and downloads instead.
  content_types = {
    "html"  = "text/html"
    "css"   = "text/css"
    "js"    = "application/javascript"
    "json"  = "application/json"
    "svg"   = "image/svg+xml"
    "png"   = "image/png"
    "jpg"   = "image/jpeg"
    "jpeg"  = "image/jpeg"
    "gif"   = "image/gif"
    "webp"  = "image/webp"
    "ico"   = "image/x-icon"
    "txt"   = "text/plain"
    "woff"  = "font/woff"
    "woff2" = "font/woff2"
  }
}

resource "aws_s3_object" "site_files" {
  for_each = fileset(local.site_source_dir, "**")

  bucket = aws_s3_bucket.website.id
  key    = each.value
  source = "${local.site_source_dir}/${each.value}"
  etag   = filemd5("${local.site_source_dir}/${each.value}")

  content_type = lookup(
    local.content_types,
    lower(reverse(split(".", each.value))[0]),
    "application/octet-stream",
  )

  depends_on = [aws_s3_bucket_policy.website_public_read]
}