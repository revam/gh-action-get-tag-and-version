
# revam/gh-action-get-tag-and-version

A simple action to get the current/next tag and version to use in other actions.

## Inputs

All inputs are optional to set.

- `static_version` — A static version to use. This will skip the searching stage
  altogether and use the provided version with the current commit details.

  Examples: `"1"`, `"1.1"`, `"1.0.1"`, `"1.0.0.1"`, `"1-dev.1"`, `"1.0-dev.1"`,
  `"1.0.0-dev.1"`

- `static_build_number` — A static build number to use with `increment_by`
  option set to `"build"` or `"suffix"`. Useful if the build number is provided
  by the environment, e.g. GitHub Actions, etc.

  Example: `42`

- `increment_by` — Increment the version number and use the current commit
  details for output date and commit sha. This option will do nothing if
  `static_version` is also set.

  Possible values are `"major"`, `"minor"`, `"patch"`, `"build"`, `"suffix"` and
  `"false"`.

  Default: `"false"`

- `incremental_tag_format` - Tag format to use when incrementing the version
  using the `increment_by` option.

  Possible values are `"full"` or `"short"`. Any other values will be considered
  as the option being set to it's default value.

  Default: `"full"`

- `use_tag_ref` — Use a specific tag ref, and omit the searching stage. Will
  throw an error if the tag ref is not found. This option will do nothing if
  `static_version` is also set.

  Default: `""`

  Examples: `"v1.0.0"`, `"v1.0.0-dev.1"`

- `use_branch_history` — Only search for for tags reachable from the current
  HEAD's history. This option will do nothing if `static_version` is also set.

  Possible values are `"true"` or `"false"`. Any other values will be considered
  as the option not being set.

  Default: `"false"`

- `prefix` — The prefix to search for, and will be set for the new tags if
  `increment_by` is used.

  Default: `"v"`

  Example: `""`, `"v"`, `"project-name-"`

- `prefix_regex` — A regex sub-pattern to match multiple prefixes while looking
  for a match. Must also match the given prefix.

  Default: `""`

  Example: `"[vV]?"`, `"project-name-[vV]?|oldProjectName-[vV]?"`

- `suffix` — An optional suffix to search for, and will be set for new tags if
  `increment_by` is used. Excluding this will omit looking for suffixes.

  Default: `""`

  Example: `"dev"`

- `suffix_regex` — A regex sub-pattern to match multiple suffixes while looking
  for a match. Must also match the given suffix.

  Default: `""`

  Example: `"dev|daily|alpha"`

- `fallback_version` — Fallback tag/version to use when no previous tag can be
  found. May include a valid prefix, but may also exclude it. This option will
  do nothing if `static_version` is also set.

  Default: `"0.0.0"`

  Examples: `"v1"`, `"1.0.0"`

## Outputs

- `tag` — The found tag with the prefix, version and suffix combined. If
  the `increment_by` option is used then this will match the `tag_full` output
  if `incremental_tag_format` option is set to `"full"`, otherwise it will match
  the `tag_short` output.

  Example: `"v1"`, `"v1.2.3-dev.1"`

- `tag_full` — The full tag with the prefix, version and suffix combined.

  Example: `"v1.2.3-dev.1"`

- `tag_short` — The short-form tag with the prefix, version and suffix combined.
  The difference between this and `tag_full` is that this will collapse any `0`
  values in thew tag name, so `v1.0.0` will be converted to `v1`, `v1.2.0` will
  be converted to `v1.2`, and so forth. Suffix numbers are always included if
  a suffix is set.

  Examples: `"v1"`, `"v1-dev.1"`, `"v1.2"`, `"v1.2-dev.1"`, `"v1.2.3"`,
  `"v1.2.3-dev.1"`

- `tag_prefix` — The tag prefix.

  Example: `"v"`

- `tag_suffix` — The tag suffix.

  Example: `"dev.1"`

- `commit` — Full git commit hash for the selected commit details.

  Example: `"9b268986ccb3999ff793d405253207fa267ebfe8"`

- `commit_short` — Short-form git commit hash for the selected commit details.

  Example: `"9b26898"`

- `version` — The full version, with build number.

  Example: `"1.2.3.1"`

- `version_short` — The version, without the build number.

  Example: `"1.2.3"`

- `version_major` — The major version number.

  Example: `"1"`

- `version_minor` — The minor version number.

  Example: `"2"`

- `version_patch` — The patch version number.

  Example: `"3"`

- `version_build` — The build version number.

  Example: `"1"`

- `date` — An ISO 8601 format timestamp in UTC offset.

  Example: `"2020-08-22T02:50:59.000Z"`

- `date_year` — The year component of the date in UTC offset.

  Example: `"2020"`

- `date_month` — The month component of the date in UTC offset.

  Example: `"08"`

- `date_day` — The day component of the date in UTC offset.

  Example: `"22"`

- `date_weekday` — The day of the week of the date in UTC offset (e.g. Monday,
  Tuesday, etc.)

  Example: `"Saturday"`

- `date_hours` — The hour component of the time in UTC offset.

  Example: `"02"`

- `date_minutes` — The minute component of the time in UTC offset.

  Example: `"50"`

- `date_seconds` — The second component of the time in UTC offset.

  Example: `"59"`

- `date_milliseconds` — The millisecond component of the time in UTC offset.

  Example: `"000"`

### Examples

Get the release info for the currently referenced tag.
```yml
- name: Get release info
  id: release_info
  uses: revam/gh-action-get-tag-and-version@v2
  with:
    use_tag_ref: ${{ github.ref }}
    prefix: v
    prefix_regex: "[vV]?"
```

Create a new release info for the current commit at the specified version.
```yml
- name: Create release info
  id: release_info
  uses: revam/gh-action-get-tag-and-version@v2
  with:
    static_version: "${{ github.event.inputs.version }}"
    prefix: v
```

Create a new release info for the next dev release based on the tags reachable
from the selected branch's history.
```yml
- name: Create next release info
  id: release_info
  uses: revam/gh-action-get-tag-and-version@v2
  with:
    use_branch_history: true
    prefix: v
    prefix_regex: "[vV]?"
    suffix: dev
    increment_by: suffix
```

Create the release info for the next release in a manually action, looking for
both stable releases and releases with a `dev` suffix (in addition to the
manually set suffix) when looking for the previous version.
```yml
  - name: Create next release info
    id: release_info
    uses: revam/gh-action-get-tag-and-version@v2
    with:
      use_branch_history: true
      prefix: v
      prefix_regex: "[vV]?"
      suffix: "${{ github.event.inputs.release }}"
      suffix_regex: "dev|${{ github.event.inputs.release }}"
      increment: suffix
```
