# Adds pgvector (vector similarity search) to DDEV's PostgreSQL 17 image, for the knowledge base
# (roadmap phase 6). The package comes from the PostgreSQL (pgdg) apt repository already set up
# in the image. Rebuild with: ddev utility rebuild -s db
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-17-pgvector && rm -rf /var/lib/apt/lists/*
