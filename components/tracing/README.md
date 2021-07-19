
# Tracing

Tracing components for Pryv.io service core

## Local usage

Run Jaeger backend:

```bash
docker run \
  --rm \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  -p 16686:16686 \
  jaegertracing/all-in-one:1.7 \
  --log-level=debug
```

then open [http://localhost:16686/](http://localhost:16686/)