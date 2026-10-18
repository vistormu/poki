# syntax=docker/dockerfile:1
# the image the homelab runs: a static binary on distroless, as nonroot.
# no node step: site.css is committed and embedded. the sqlite driver is pure
# go (modernc), so no cgo, and the binary needs nothing from the image; the tz
# database is embedded (main.go), so TZ sets the terminal's today.
# github builds and publishes it on a v* tag (.github/workflows/image.yml).
ARG GO_VERSION=1.26.7

FROM golang:${GO_VERSION} AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-mod=readonly
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY . .
ARG VERSION=dev
RUN go build -trimpath -ldflags="-s -w -X poki/cmd.version=${VERSION}" -o /out/poki . \
    && mkdir /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/poki /poki
# the db lives in /data: mount a volume there, writable by nonroot (65532)
COPY --from=build --chown=65532:65532 /out/data /data
ENV POKI_ADDR=:8091 POKI_DB=/data/poki.db
VOLUME /data
EXPOSE 8091
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/poki", "health"]
USER nonroot
ENTRYPOINT ["/poki"]
CMD ["run"]
