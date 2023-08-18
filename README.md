# CodeQL Selective Analysis on Pull Requests

This repo contains an example workflow file demonstrating how to make CodeQL a required status check for Pull Requests, but to skip it in the case that only a certain subset of files are modified (for example, documentation files).

## Usage

The [sample workflow](.github/workflows/codeql-analysis.yml) demonstrates the basic pattern. We first need to identify which files have been changed as part of the pull request, through the use of a separate job we call `filter-paths`:

```
  filter-paths:
    name: Identify paths which have changed
    runs-on: ubuntu-latest
    outputs:
      changes_outside_docs: ${{ steps.filter-docs.outputs.changes_outside_docs }}
    steps:
      - uses: dorny/paths-filter@v2
        if: github.event_name == 'pull_request'
        id: filter-docs
        with:
          filters: |
            changes_outside_docs:
              - '!(docs/**)'
```

This uses the `dorny/paths-filter` action to identify the modified files and determine if there are any changes outside the "docs/" directory, the set a `changes_outside_docs` output from the job to be `true` if there are changes outside the docs directory and `false` if not. `dorny/paths-filter` provides a general globbing syntax based on https://github.com/micromatch/picomatch.

If you prefer not to add a third-dependency, this list of modified files can instead be fetched using the GitHub API ([List pull requests files](https://docs.github.com/en/free-pro-team@latest/rest/pulls/pulls?apiVersion=2022-11-28#list-pull-requests-files)) and manually parsed for the relevant changed.

The next step is to modify the standard CodeQL `analyze` job as follows:
```
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    needs: filter-paths
    if: github.event_name != 'pull_request' || needs.filter-paths.outputs.changes_outside_docs == 'true'
    ...
```

We first add a dependency on the `filter-paths` job using the `needs` property. We then add a conditional to the job, that states the job is only run if the event is not a pull request, or if changes have occurred outside the docs directory (according to the previously set output property of the `filter-paths` job). This will prevent the `analyze` job from running if the event is a pull request and only the `docs` directory was modified.

Finally, we add a new job, `skip-codeql-check`. In the case that the `analyze` job does not run this job will be used to set the required commit status for the `CodeQL` context:

```
  skip-codeql-check:
    name: Skip CodeQL check
    runs-on: ubuntu-latest
    needs: filter-paths
    if: github.event_name == 'pull_request' && needs.filter-paths.outputs.changes_outside_docs == 'false'
    steps:
      - uses: actions/github-script@v6
        with:
          script: |
            const paramObj = {
              owner: context.repo.owner,
              repo: context.repo.repo,
              sha: context.payload.pull_request.head.sha,
              state: 'success',
              description: "Skipped CodeQL analysis as only non-code artifacts were modified.",
              context: "CodeQL"
            };
            console.log(paramObj);
            const result = await github.rest.repos.createCommitStatus(paramObj);
            console.log(result);
```

This job uses the `actions/github-script` API to set the commit status for `CodeQL` to "success", and to add an explanatory comment saying that the real check was skipped because no relevant files were changed.
