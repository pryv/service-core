# Benchmark Comparison

| | **A** | **B** |
|---|---|---|
| File | 2026-03-23T16-12-55-full-mongodb | 2026-03-23T16-20-18-full-postgresql |
| Date | 2026-03-23T16:12:55.181Z | 2026-03-23T16:20:18.490Z |
| Duration | 15s | 15s |
| Concurrency | 10 | 10 |

## Performance

| Sub-scenario | Req/s A | Req/s B | Delta | p50 A | p50 B | p95 A | p95 B |
|---|---:|---:|---:|---:|---:|---:|---:|
| events-create/events-create-master | 289.07 | 330.87 | +41.8 (+14.5%) | 30.62 | 27.31 | 63.39 | 51.96 |
| events-create/events-create-restricted | 373.27 | 372 | -1.3 (-0.3%) | 23.43 | 22.96 | 48.97 | 50.01 |
| events-get/no-filter-master | 140.33 | 156.93 | +16.6 (+11.8%) | 62.77 | 57.74 | 131.09 | 110.95 |
| events-get/no-filter-restricted | 199.67 | 190.67 | -9.0 (-4.5%) | 45.39 | 46.19 | 85.88 | 92.76 |
| events-get/stream-parent-master | 184.6 | 176.73 | -7.9 (-4.3%) | 49.3 | 50.06 | 89.89 | 99.06 |
| events-get/stream-parent-restricted | 209.33 | 197.2 | -12.1 (-5.8%) | 43.73 | 45.31 | 79.34 | 87.15 |
| events-get/time-range-master | 163.67 | 71.47 | -92.2 (-56.3%) | 55.31 | 131.22 | 104.01 | 216.16 |
| events-get/time-range-restricted | 142.8 | 142.6 | -0.2 (-0.1%) | 63.14 | 64.92 | 114.32 | 110.34 |
| mixed-workload/mixed-workload | 192.2 | 192.73 | +0.5 (+0.3%) | 46.15 | 45.98 | 96.51 | 96.7 |
| series-read/series-read-1k-points | 252.6 | 212.8 | -39.8 (-15.8%) | 35.9 | 40.18 | 67.15 | 89 |
| series-read/series-read-10k-points | 50.93 | 51.6 | +0.7 (+1.3%) | 184.35 | 187.45 | 300.8 | 280.53 |
| series-read/series-read-100k-points | 4.67 | 4.47 | -0.2 (-4.3%) | 2290.32 | 2411.43 | 3299.06 | 3463.51 |
| series-write/series-write-batch10 | 339.87 | 380.93 | +41.1 (+12.1%) | 24.99 | 23.96 | 57.18 | 40.89 |
| series-write/series-write-batch100 | 312.27 | 334.6 | +22.3 (+7.2%) | 28.65 | 26.95 | 54.27 | 49.45 |
| series-write/series-write-batch1000 | 134.2 | 132.2 | -2.0 (-1.5%) | 71.02 | 71.47 | 113.75 | 119.19 |
| streams-create/streams-create-flat | 88.6 | 87.67 | -0.9 (-1.0%) | 107.76 | 107.82 | 200.32 | 197.64 |
| streams-create/streams-create-nested | 59.13 | 55.53 | -3.6 (-6.1%) | 166.41 | 177.34 | 272.07 | 294.36 |
| streams-update/streams-update | 43.07 | 42.4 | -0.7 (-1.6%) | 228.23 | 230.46 | 345.54 | 357.84 |

## Summary

- **Average throughput change:** -3.0%
- **Faster in B:** 6/18 sub-scenarios
- **Slower in B:** 12/18 sub-scenarios

## Storage

| Engine | Growth A | Growth B | Delta |
|--------|----------|----------|-------|
| mongodb | 39.7MB | 18.7MB | -21.0MB |
| sqlite | 104.6KB | 104.6KB | +0B |
| influxdb | 462.0B | 462.0B | +0B |
| userDirs | 44.7MB | 49.4MB | +4.7MB |
| syslogSize | 28.7MB | 28.4MB | -355.4KB |
| syslogLines | +95343 | +94796 | -547 |

## Notes

_Add observations here._
