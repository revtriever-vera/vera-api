---
name: prod-check
description: Checks that a deploy reached production and what it is doing there. Use after a merge to `main`, before calling anything published, and when asked whether production is healthy ("subiu?", "está no ar?", "tem erro em produção?").
---

# Prod check

Run the fixed script from inside the repo that was deployed. It takes a commit, never a query, so today's number compares with yesterday's:

```
bash .claude/skills/prod-check/scripts/prod-check.sh [commit]    # default: origin/main
```

It prints the pipeline of that commit, the version each service is serving, the 5xx rate per service, the error log lines per version and the most frequent errors of the version checked. The queries are the ones the alert rules of the observability setup use.

## Reading it

- **Published** means the version is serving, which is more than the deploy job ending. For the API, the short commit appears under "versão que está atendendo". The web app publishes no service with metrics: for it, published is its deploy job green, and the API numbers tell whether the screens it calls are healthy.
- The deploy starts only after the CI of `main` passes. While the pipeline is still running, wait for it once with a single watch (`gh run watch <id> --exit-status`), then run the script again.
- A cancelled CI was superseded by a newer merge: check the newest commit.
- An error that exists only in the new version is yours until shown otherwise. An error the previous version also had is pre-existing: report it in one line and leave it out of this delivery.
- Without Grafana access the script checks the pipeline only. Say "deploy concluído, produção não conferida", never "publicado".

## Reporting

Tell the person, in their terms, whether it is published, since when, and whether errors rose. Give the numbers exactly as printed.

## Gotchas

- `service_version` starts with the first seven characters of the commit (the script matches by prefix, so a full SHA also works).
- In Loki, `service_version` is not an index label: filter it after the pipe, as the script does.
- A Loki window longer than seven days times out. For a long window, use the database.
- A question the script does not answer, and that will be asked again, becomes a new query in the script, by PR. An improvised query gives a number nobody can compare.
- The script was written against the telemetry labels used by `observability` (`service_name`, `service_version`, `deployment_environment_name`). The first time it runs after a real deploy, confirm those labels match and fix the script by PR if they do not.
