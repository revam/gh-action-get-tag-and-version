
# revam/gh-action-get-tag-and-version

A simple action to get the current/next tag and version to use in other actions.

## Inputs

All inputs are optional to set.

- `fallback` — Fallback tag/version to use when no previous tag can be found.
  May include a valid prefix, but may also exclude it.

  Default: `"0.0.0"`

- `increment` — Increment the version number by one digit.

  Possible values are `"major"`, `"minor"`, `"patch"`, `"build"`, `"suffix"` and
  `"false"`.

  Default: `"false"`

- `tag` — Tag to use. Will omit the searching stage and use the supplied tag ref
  if its a valid match.

  Example: `"v1.0.0"`

- `branch` — Only search for for tags on the currently selected branch.

  Possible values are `"true"` or `"false"`. Any other values will be considered
  as the option not being set.

  Default: `"false"`

- `prefix` — The prefix to search for, and will be set for the new tags if
  auto-increment is enabled.

  Default: `"v"`

- `prefixRegex` — A regex sub-pattern to match multiple prefixes while looking
  for a match. Must also match the given prefix.

  Example: `"[vV]?"`

- `suffix` — An optional suffix to search for, and will be set for new tags if
  auto-increment is enabled.

  Example: `"dev"`

- `suffixRegex` — A regex sub-pattern to match multiple suffixes while looking
  for a match. Must also match the given suffix.

  Example: `"dev|daily|alpha"`

## Outputs

- `tag` — The full tag with the prefix, version and suffix combined.

  Example: `"v1.2.3-dev.1"`

- `prefix` — The tag prefix.

  Example: `"v"`

- `suffix` — The tag suffix.

  Example: `"dev.1"`

- `version` — The full version, with build number.

  Example: `"1.2.3.1"`

- `version_major` — The major version number.

  Example: `"1"`

- `version_minor` — The minor version number.

  Example: `"2"`

- `version_patch` — The patch version number.

  Example: `"3"`

- `version_build` — The build version number.

  Example: `"1"`

### Examples

Get the release info for the currently referenced tag.
```yml
- name: Get release info
  id: release_info
  uses: revam/gh-action-get-tag-and-version@v1
  with:
    tag: "{{ github.ref }}"
    prefix: v
    prefixRegex: "[vV]?"
```

Create the release info for the next dev release based on the tags reachable
from the selected branch.
```yml
- name: Create next release info
  id: release_info
  uses: revam/gh-action-get-tag-and-version@v1
  with:
    branch: true
    prefix: v
    prefixRegex: "[vV]?"
    suffix: dev
    increment: suffix
```

Create the release info for the next release in a manually action, looking for
both stable releases and releases with a `dev` suffix (in addition to the
manually set suffix) when looking for the previous version.
```yml
  - name: Create next release info
    id: release_info
    uses: revam/gh-action-get-tag-and-version@v1
    with:
      branch: true
      prefix: v
      prefixRegex: "[vV]?"
      suffix: ${{ github.event.inputs.release }}
      suffixRegex: "dev|${{ github.event.inputs.release }}"
      increment: suffix
```
