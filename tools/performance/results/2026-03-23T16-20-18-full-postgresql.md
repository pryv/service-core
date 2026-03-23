# Full Benchmark Run

**Date:** 2026-03-23T16:20:18.490Z  
**Duration:** 15s per scenario | **Concurrency:** 10  
**Target:** http://127.0.0.1:3000 | **Profile:** manual

## Server Config
- **Base storage:** mongodb | **Platform:** sqlite | **Series:** influxdb
- **Audit:** ON | **Integrity:** {"attachments":true,"events":true,"accesses":true}
- **API workers:** 2

## System
- **CPU:** Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz (8 cores) | **Memory:** 31.0GB
- **Node:** v24.14.0 | **Version:** 2.0.0-pre.2 (f5f5e80c)

## Summary

| Scenario | Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| events-create | events-create-master | 330.87 | 27.31 | 51.96 | 66.69 | 95.82 | 4963 | 0 |
| events-create | events-create-restricted | 372 | 22.96 | 50.01 | 71.96 | 135.1 | 5580 | 0 |
| events-get | no-filter-master | 156.93 | 57.74 | 110.95 | 139.72 | 204.4 | 2354 | 0 |
| events-get | no-filter-restricted | 190.67 | 46.19 | 92.76 | 137.35 | 220.75 | 2860 | 0 |
| events-get | stream-parent-master | 176.73 | 50.06 | 99.06 | 139.23 | 225.2 | 2651 | 0 |
| events-get | stream-parent-restricted | 197.2 | 45.31 | 87.15 | 120.54 | 227.18 | 2958 | 0 |
| events-get | time-range-master | 71.47 | 131.22 | 216.16 | 293.98 | 397.32 | 1072 | 0 |
| events-get | time-range-restricted | 142.6 | 64.92 | 110.34 | 148.03 | 291.84 | 2139 | 0 |
| mixed-workload | mixed-workload | 192.73 | 45.98 | 96.7 | 126.07 | 205.3 | 2891 | 0 |
| series-read | series-read-1k-points | 212.8 | 40.18 | 89 | 126.6 | 249.61 | 3192 | 0 |
| series-read | series-read-10k-points | 51.6 | 187.45 | 280.53 | 347.94 | 440.4 | 774 | 0 |
| series-read | series-read-100k-points | 4.47 | 2411.43 | 3463.51 | 3796.53 | 3796.53 | 67 | 0 |
| series-write | series-write-batch10 | 380.93 | 23.96 | 40.89 | 73.26 | 189.56 | 5714 | 0 |
| series-write | series-write-batch100 | 334.6 | 26.95 | 49.45 | 85.36 | 148.6 | 5019 | 0 |
| series-write | series-write-batch1000 | 132.2 | 71.47 | 119.19 | 167.51 | 251.13 | 1983 | 0 |
| streams-create | streams-create-flat | 87.67 | 107.82 | 197.64 | 233.48 | 323.51 | 1315 | 0 |
| streams-create | streams-create-nested | 55.53 | 177.34 | 294.36 | 346.14 | 432.47 | 833 | 0 |
| streams-update | streams-update | 42.4 | 230.46 | 357.84 | 470.85 | 528.51 | 636 | 0 |

## events-create

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| events-create-master | 330.87 | 27.31 | 51.96 | 66.69 | 95.82 | 4963 | 0 |
| events-create-restricted | 372 | 22.96 | 50.01 | 71.96 | 135.1 | 5580 | 0 |

Resources: peak RSS=151.9MB, peak CPU=6%

## events-get

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| no-filter-master | 156.93 | 57.74 | 110.95 | 139.72 | 204.4 | 2354 | 0 |
| no-filter-restricted | 190.67 | 46.19 | 92.76 | 137.35 | 220.75 | 2860 | 0 |
| stream-parent-master | 176.73 | 50.06 | 99.06 | 139.23 | 225.2 | 2651 | 0 |
| stream-parent-restricted | 197.2 | 45.31 | 87.15 | 120.54 | 227.18 | 2958 | 0 |
| time-range-master | 71.47 | 131.22 | 216.16 | 293.98 | 397.32 | 1072 | 0 |
| time-range-restricted | 142.6 | 64.92 | 110.34 | 148.03 | 291.84 | 2139 | 0 |

Resources: peak RSS=151.9MB, peak CPU=12%

## mixed-workload

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| mixed-workload | 192.73 | 45.98 | 96.7 | 126.07 | 205.3 | 2891 | 0 |

Resources: peak RSS=117.5MB, peak CPU=4%

## series-read

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| series-read-1k-points | 212.8 | 40.18 | 89 | 126.6 | 249.61 | 3192 | 0 |
| series-read-10k-points | 51.6 | 187.45 | 280.53 | 347.94 | 440.4 | 774 | 0 |
| series-read-100k-points | 4.47 | 2411.43 | 3463.51 | 3796.53 | 3796.53 | 67 | 0 |

Resources: peak RSS=117.5MB, peak CPU=13%

## series-write

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| series-write-batch10 | 380.93 | 23.96 | 40.89 | 73.26 | 189.56 | 5714 | 0 |
| series-write-batch100 | 334.6 | 26.95 | 49.45 | 85.36 | 148.6 | 5019 | 0 |
| series-write-batch1000 | 132.2 | 71.47 | 119.19 | 167.51 | 251.13 | 1983 | 0 |

Resources: peak RSS=116.9MB, peak CPU=2%

## streams-create

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| streams-create-flat | 87.67 | 107.82 | 197.64 | 233.48 | 323.51 | 1315 | 0 |
| streams-create-nested | 55.53 | 177.34 | 294.36 | 346.14 | 432.47 | 833 | 0 |

Resources: peak RSS=117.7MB, peak CPU=4%

## streams-update

| Sub-scenario | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | OK | Fail |
|---|---:|---:|---:|---:|---:|---:|---:|
| streams-update | 42.4 | 230.46 | 357.84 | 470.85 | 528.51 | 636 | 0 |

Resources: peak RSS=117.9MB, peak CPU=4%

## Storage (from clean baseline)

| Engine | Clean DB | After all | Total growth |
|--------|----------|-----------|-------------|
| mongodb | 1.0GB | 1.1GB | +18.7MB |
| sqlite | 160.8KB | 265.4KB | +104.6KB |
| influxdb | 276.0KB | 276.5KB | +462.0B |
| userDirs | 160.8KB | 49.5MB | +49.4MB |
| syslogSize | 120.2MB | 148.6MB | +28.4MB |
| syslogLines | 408046 | 502842 | +94796 |

## Storage (benchmark run only)

| Engine | Before | After | Delta |
|--------|--------|-------|-------|
| mongodb | 1.0GB | 1.1GB | +14.6MB |
| sqlite | 265.4KB | 265.4KB | +0B |
| influxdb | 276.3KB | 276.5KB | +194.0B |
| userDirs | 32.3MB | 49.5MB | +17.3MB |
| syslogSize | 124.3MB | 148.6MB | +24.3MB |
| syslogLines | 418496 | 502842 | +84346 |

## Notes

_Add observations here._
