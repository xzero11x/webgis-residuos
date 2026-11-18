FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client libexpat1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/bagua-master/requirements-heights.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
ENV BAGUA_HEIGHTS_DIRECT_DB=1 PYTHONUNBUFFERED=1
