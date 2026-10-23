# Herramientas de generación de teselas de BAGUA MASTER (solo entorno de desarrollo).
# tippecanoe genera MBTiles desde GeoJSON y go-pmtiles los convierte a PMTiles.
# Ambas versiones están fijadas; no forman parte del servicio en ejecución.
FROM debian:bookworm-slim AS build
ARG TIPPECANOE_TAG=2.79.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git ca-certificates libsqlite3-dev zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${TIPPECANOE_TAG}" https://github.com/felt/tippecanoe.git /src/tippecanoe \
 && make -C /src/tippecanoe -j"$(nproc)" \
 && make -C /src/tippecanoe PREFIX=/opt/tippecanoe install

FROM debian:bookworm-slim AS runtime
ARG PMTILES_VERSION=1.31.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends libsqlite3-0 zlib1g ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
      -o /tmp/pmtiles.tar.gz \
 && tar -xzf /tmp/pmtiles.tar.gz -C /usr/local/bin pmtiles \
 && rm /tmp/pmtiles.tar.gz
COPY --from=build /opt/tippecanoe/bin/tippecanoe /usr/local/bin/tippecanoe
COPY --from=build /opt/tippecanoe/bin/tile-join /usr/local/bin/tile-join
WORKDIR /work
ENTRYPOINT ["tippecanoe"]
