Map overviews + Sacred drop images live on Cloudinary:

  folder: <CLOUDINARY_FOLDER>/maps   (default team-coach/maps)
  delivery: https://res.cloudinary.com/<CLOUD>/image/upload/<folder>/maps/<path>.jpg

Catalog API (GET /maps) returns those HTTPS URLs when CLOUDINARY_CLOUD_NAME is set.
Local JPGs are not kept in the repo — upload with a one-off script if you need to refresh assets.
GET /maps/files/* remains only as a local/dev fallback if files exist under this folder.
