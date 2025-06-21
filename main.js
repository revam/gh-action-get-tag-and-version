//#region Imports

const { exec, execSync } = require("child_process");
const fs = require("fs");

//#endregion Imports
//#region Type Definitions

/**
 * Version match object.
 *
 * @typedef {object} VersionMatch
 * @property {string} tag - The full tag.
 * @property {string} version - The full version, with build and/or suffix number.
 * @property {string} suffix - The tag suffix.
 * @property {string} prefix - The tag prefix.
 * @property {number} major - The major version number.
 * @property {number} minor - The minor version number.
 * @property {number} patch - The patch version number.
 * @property {number} build - The build version number, if any.
 * @property {number} suffixNumber - The suffix number, if any.
 * @property {string} [rawSuffixNumber] - The raw suffix number, if any.
 * @property {string} commit - The commit hash.
 * @property {Date} date - The timestamp when the tag was committed.
 */

//#endregion Type Definitions
//#region Setup

// Text coloring for the terminal.
const FormatSuccess = "\x1b[32m%s\x1b[0m";
const FormatWarning = "\x1b[33m%s\x1b[0m";
const FormatError = "\x1b[31m%s\x1b[0m";

/**
 * Days of the week.
 *
 * @type {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]}
 */
const Weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Provided by the action runner normally. We use "/dev/stderr" as a fallback
 * for testing locally.
 *
 * @type {string}
 *
 * @default "/dev/stderr"
 */
const OutputFile = process.env.GITHUB_OUTPUT || "/dev/stderr";

/**
 * A static version to use. This will skip the searching stage altogether and
 * use the provided version with the current commit details.
 *
 * @type {string}
 *
 * @default ""
 */
const StaticVersion = process.env.INPUT_STATIC_VERSION || "";

/**
 * A static build number to use with `increment_by` option set to `"build"` or
 * `"suffix"`. Useful if the build number is provided by the environment, e.g.
 * GitHub Actions, etc.
 *
 * @type {number | null}
 *
 * @default null
 */
const StaticBuildNumber = !StaticVersion && process.env.INPUT_STATIC_BUILD_NUMBER && !Number.isNaN(parseInt(process.env.INPUT_STATIC_BUILD_NUMBER, 10)) ? parseInt(process.env.INPUT_STATIC_BUILD_NUMBER, 10) : null;

/**
 * Increment the version number and use the current commit details for output
 * date and commit sha. This option will do nothing if `static_version` is also
 * set.
 *
 * @type {"major" | "minor" | "patch" | "build" | "suffix" | false}
 *
 * @default false
 */
const IncrementBy = !StaticVersion && process.env.INPUT_INCREMENT_BY && process.env.INPUT_INCREMENT_BY.toLowerCase() !== "false" ? process.env.INPUT_INCREMENT_BY.toLowerCase() : false;

/**
 * Tag format to use when incrementing the version using the `increment_by`
 * option.
 *
 * @type {"full" | "short"}
 *
 * @default "full"
 */
const IncrementalTagFormat = process.env.INPUT_INCREMENTAL_TAG_FORMAT === "short" ? "short" : "full";

/**
 * Use a specific tag ref, and omit the searching stage. Will throw an error if
 * the tag ref is not found. This option will do nothing if `static_version` is
 * also set.
 *
 * @type {string}
 *
 * @default ""
 */
const UseTagRef = process.env.INPUT_USE_TAG_REF || "";

/**
 * Only search for for tags reachable from the current HEAD's history. This
 * option will do nothing if `static_version` is also set.
 *
 * @type {boolean}
 *
 * @default false
 */
const UseBranchHistory = !StaticVersion && process.env.INPUT_USE_BRANCH_HISTORY === "true";

/**
 * The prefix to search for, and will be set for the new tags if `increment_by`
 * is used.
 *
 * @type {string}
 *
 * @default "v"
 */
const Prefix = process.env.INPUT_PREFIX != null ? process.env.INPUT_PREFIX : "v";

/**
 * A regex sub-pattern to match multiple prefixes while looking for a match.
 * Must also match the given prefix.
 *
 * @type {string}
 *
 * @default ""
 */
const PrefixRegex = process.env.INPUT_PREFIX_REGEX || "";

/**
 * An optional suffix to search for, and will be set for new tags if
 * `increment_by` is used. Excluding this will omit looking for suffixes.
 *
 * @type {string}
 *
 * @default ""
 */
const Suffix = process.env.INPUT_SUFFIX || "";

/**
 * A regex sub-pattern to match multiple suffixes while looking for a match.
 * Must also match the given suffix.
 *
 * @type {string}
 *
 * @default ""
 */
const SuffixRegex = process.env.INPUT_SUFFIX_REGEX || "";

/**
 * Fallback tag/version to use when no previous tag can be found. May include a
 * valid prefix, but may also exclude it. This option will do nothing if
 * `static_version` is also set.
 *
 * @type {string}
 *
 * @default "0.0.0"
 */
const FallbackValue = process.env.INPUT_FALLBACK_VERSION || "0.0.0";

/**
 * The regex to use to match tags.
 * @type {RegExp}
 */
const TagRegex = Suffix || SuffixRegex ? (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})(?<version>(?<major>\\d+)(?:\\.(?<minor>\\d+)(?:\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)?)?)(?:\\-(?<suffix>${SuffixRegex || Suffix}(?:\\.(?<suffixNumber>\\d+))?))?$`)
) : (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})(?<version>(?<major>\\d+)(?:\\.(?<minor>\\d+)(?:\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)?)?)$`)
);

/**
 * The regex to use to match versions.
 * @type {RegExp}
 */
const VersionRegex = Suffix || SuffixRegex ? (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})?(?<version>(?<major>\\d+)(?:\\.(?<minor>\\d+)(?:\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)?)?)(?:\\-(?<suffix>${SuffixRegex || Suffix}(?:\\.(?<suffixNumber>\\d+))?))?$`)
) : (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})?(?<version>(?<major>\\d+)(?:\\.(?<minor>\\d+)(?:\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)?)?)$`)
);

// Get the latest commit details.
const CurrentCommitCommand = `git rev-list --no-commit-header --pretty="%aI|||%H" -n 1 HEAD`;

// Command to run.
const BaseCommand = StaticVersion ? (
  // Get the latest commit details we need for the static version.
  CurrentCommitCommand
) : UseTagRef ? (
  // Get the tag and version info for the selected tag.
  UseTagRef.startsWith("refs") ? (
    `git for-each-ref --sort=-creatordate --format="%(refname:short)|||%(creatordate)|||%(objectname)" ${UseTagRef}`
  ) : (
    `git tag --sort=-creatordate --format="%(refname:short)|||%(creatordate)|||%(objectname)" --list ${UseTagRef}`
  )
) : UseBranchHistory ? (
  // Get the tags reachable from the current HEAD.
  'git rev-list --no-commit-header --pretty="%D|||%aI|||%H" HEAD'
) : (
  // Get all the tags in the repository.
  'git for-each-ref --sort=-creatordate --format="%(refname:short)|||%(creatordate)|||%(objectname)" "refs/tags/*"'
);

// Make sure we have a valid auto-increment value.
const AutoIncrementSet = new Set(["major", "minor", "patch", "build", "suffix"]);
if (IncrementBy && !AutoIncrementSet.has(IncrementBy)) {
  console.log(FormatError, `Invalid value "${IncrementBy}" supplied to input "increment". Valid values are "${Array.from(AutoIncrementSet).join('", "')}" `);
  process.exit(1);
}

// Make sure we have a valid regex for our prefix if it's set.
if (PrefixRegex && !(new RegExp(`^${PrefixRegex}$`).test(Prefix))) {
  console.log(FormatError, 'Input "prefixRegex" must match input "prefix" if set. Exiting.');
  process.exit(1);
}

// Make sure we have a valid regex for our suffix if it's set.
if (SuffixRegex && !(new RegExp(`^${SuffixRegex}$`).test(Suffix))) {
  console.log(FormatError, 'Input "suffixRegex" must match input "suffix" if set. Exiting.');
  process.exit(1);
}

// Make sure we have a valid fallback value.
if (!VersionRegex.test(FallbackValue)) {
  console.log(FormatError, `Invalid value "${FallbackValue}" supplied to input "fallback". Must match regex "${VersionRegex.source}"`);
  process.exit(1);
}

// Make sure we have a valid static version value.
if (StaticVersion && !VersionRegex.test(StaticVersion)) {
  console.log(FormatError, `Invalid value "${StaticVersion}" supplied to input "version". Must match regex "${VersionRegex.source}"`);
  process.exit(1);
}

//#endregion Setup
//#region Run

exec(BaseCommand, (error, stdout, stderr) => {
  if (error) {
    console.log(FormatWarning, "An error occurred while trying to find the tags:");
    console.log(FormatError, stderr);
    process.exit(error.code || error.signal || 1);
  }

  if (StaticVersion) {
    if (StaticVersion.startsWith(Prefix)) {
      stdout = StaticVersion + "|||" + stdout;
    }
    else {
      stdout = Prefix + StaticVersion + "|||" + stdout;
    }
  }

  // Read the tags from the output.
  let tags = stdout
    .trim()
    .split(/\r\n|\r|\n/g)
    .filter(tag => tag.trim());
  // Additional parsing for ref-parse
  if (UseBranchHistory) {
    tags = tags
      .filter(ref => ref.includes("tag:") && ref.includes("|||"))
      .flatMap(ref => {
        const [heads, ...rest] = ref.split("|||");
        return heads.split(",")
          .map(head => head.trim())
          .filter(tag => tag.startsWith("tag:"))
          .map(tag => `${tag.slice(4).trim()}|||${rest.join("|||")}`);
      });
  }
  if (tags.length === 0) {
    // Exit if we could not find the referenced tag.
    if (UseTagRef) {
      console.log(FormatError, "Unable to find a match on the given tag. Exiting.");
      process.exit(1);
    }

    // Set the fallback value if no tags were found for the branch or in the repo.
    console.log(FormatWarning, `Unable to find any tags, using fallback value "${FallbackValue}".`);
    if (FallbackValue.startsWith(Prefix))
      tags.push(FallbackValue + "|||" + new Date().toISOString());
    else
      tags.push(Prefix + FallbackValue + "|||" + new Date().toISOString());
  }

  /**
   * @type {VersionMatch[]}
   */
  const foundVersions = [];

  // Check if any of the found tags match the regex,
  for (const value of tags) {
    const [tag = "", dateText = "", commit = ""] = value.split("|||");
    if (!dateText.trim() || !commit.trim())
      continue;
    const date = new Date(dateText.trim());
    const result = TagRegex.exec(tag);
    if (result)
      foundVersions.push(extractVersionFromMatch(result, date, commit));
  }

  if (foundVersions.length === 0) {
    console.log(FormatError, "Unable to find a matching tag. Exiting.");
    process.exit(1);
  }

  if (StaticVersion) {
    console.log(FormatSuccess, `Using provided version.`);
  }
  else {
    console.log(FormatSuccess, `Found ${foundVersions.length} available versions.`);
  }
  const highestVersion = foundVersions.reduce((current, next) => {
    // If current is higher, then keep it, else if next is higher, then switch, else goto next block.
    if (current.major > next.major)
      return current;
    if (current.major < next.major)
      return next;

    // same as above.
    if (current.minor > next.minor)
      return current;
    if (current.minor < next.minor)
      return next;

    // same as above.
    if (current.patch > next.patch)
      return current;
    if (current.patch < next.patch)
      return next;

    // same as above.
    if (current.build > next.build)
      return current;
    if (current.build < next.build)
      return next;

    // same as above.
    if (current.suffixNumber > next.suffixNumber)
      return current;
    if (current.suffixNumber < next.suffixNumber)
      return next;

    // both are equal, so keep current.
    return current;
  }, foundVersions[0]);

  printVersionMatch(highestVersion);
});

/**
 * Extract tag/version info from result.
 *
 * @param {RegExpExecArray} result - Result the match stage.
 * @param {Date} date - The timestamp when the tag was committed.
 * @param {string} commit - The commit hash.
 * @returns {VersionMatch}
 */
function extractVersionFromMatch(result, date, commit) {
  // Extract info from regex result.
  const major = parseInt(result.groups.major, 10);
  const minor = parseInt(result.groups.minor || "0", 10);
  const patch = parseInt(result.groups.patch || "0", 10);
  const build = parseInt(result.groups.build || "0", 10);
  const suffixNumber = parseInt(result.groups.suffixNumber || (build > 0 ? build.toString(10) : "0"), 10);
  return {
    version: `${major}.${minor}.${patch}${build > 0 ? `.${build}` : suffixNumber > 0 ? `.${suffixNumber}` : ".0"}`,
    major,
    minor,
    patch,
    build,
    prefix: result.groups.prefix,
    suffix: result.groups.suffix,
    suffixNumber,
    rawSuffixNumber: result.groups.suffixNumber,
    commit,
    date,
    tag: result[0],
  };
}

/**
 * Log to the console and set the outputs.
 *
 * @param {VersionMatch} versionMatch - Result from the match stage.
 * @returns {never} Will exit upon completion.
 */
function printVersionMatch(versionMatch) {
  // Extract info from regex result.
  let {
    version: foundVersion,
    major,
    minor,
    patch,
    build,
    suffixNumber,
    commit,
    date,
    tag: foundTag,
    prefix: foundPrefix,
    suffix: foundSuffix,
  } = versionMatch;

  if (IncrementBy) {
    // Conditionally auto-increment values.
    switch (IncrementBy) {
      case "major":
        major++;
        minor = 0;
        patch = 0;
        build = 0;
        break;
      case "minor":
        minor++;
        patch = 0;
        build = 0;
        break;
      case "patch":
        patch++;
        build = 0;
        break;
      case "build":
        build = StaticBuildNumber !== null ? StaticBuildNumber : build + 1;
        suffixNumber = 0;
        break;
      case "suffix":
        suffixNumber = StaticBuildNumber !== null ? StaticBuildNumber : suffixNumber + 1;
        build = suffixNumber;
        break;
    }

    // Update commit & date if auto-incrementing.
    try {
      const details = execSync(CurrentCommitCommand, { encoding: "utf-8" }).trim().split("|||");
      commit = details[1];
      date = new Date(details[0]);
    }
    catch (error) {
      console.log(FormatError, `An error occurred while trying to get the current commit details for auto-incrementing the version. Error: ${error}`);
      process.exit(1);
    }
  }

  // Set the version/tag/timestamp.
  const version = `${major}.${minor}.${patch}.${build}`;
  const versionNoBuild = `${major}.${minor}.${patch}`;
  let prefix = IncrementBy ? Prefix : foundPrefix;
  let suffix = IncrementBy ? (
    Suffix && IncrementBy === "suffix" ? (
      Suffix + "." + suffixNumber
    ) : (
      Suffix
    )
  ) : (
    foundSuffix && versionMatch.rawSuffixNumber ? (
      foundSuffix + "." + versionMatch.rawSuffixNumber
    ) : (
      foundSuffix || ""
    )
  );
  let tag = foundTag;
  let tag_full = `${prefix}${major}.${minor}.${patch}`;
  let tag_short = `${prefix}${major}`;
  const addBuild = build > 0 && IncrementBy !== "suffix";
  if (minor > 0 || patch > 0 || addBuild) {
    tag_short += `.${minor}`;
  }
  if (patch > 0 || addBuild) {
    tag_short += `.${patch}`;
  }
  if (addBuild) {
    tag_full += `.${build}`;
    tag_short += `.${build}`;
  }
  if (suffix) {
    tag_full += `-${suffix}`;
    tag_short += `-${suffix}`;
  }
  if (IncrementBy) {
    tag = IncrementalTagFormat === "short" ? tag_short : tag_full;
  }

  // Log info to console.
  console.log(FormatSuccess, `Found tag: ${foundTag}`);
  console.log(FormatSuccess, `Found version: ${foundVersion}`);
  if (IncrementBy) {
    console.log(FormatSuccess, `Next tag: ${tag} (Full: ${tag_full}, Short: ${tag_short})`);
    console.log(FormatSuccess, `Next version: ${version}`);
  }

  // Add tag to output file
  fs.appendFileSync(OutputFile, `tag=${tag}\n`);
  fs.appendFileSync(OutputFile, `tag_full=${tag_full}\n`);
  fs.appendFileSync(OutputFile, `tag_short=${tag_short}\n`);
  fs.appendFileSync(OutputFile, `tag_prefix=${prefix}\n`);
  fs.appendFileSync(OutputFile, `tag_suffix=${suffix}\n`);

  // Add version to output file.
  fs.appendFileSync(OutputFile, `version=${version}\n`);
  fs.appendFileSync(OutputFile, `version_short=${versionNoBuild}\n`);
  fs.appendFileSync(OutputFile, `version_major=${major}\n`);
  fs.appendFileSync(OutputFile, `version_minor=${minor}\n`);
  fs.appendFileSync(OutputFile, `version_patch=${patch}\n`);
  fs.appendFileSync(OutputFile, `version_build=${build}\n`);

  // Add commit hash to output file.
  fs.appendFileSync(OutputFile, `commit=${commit}\n`);
  fs.appendFileSync(OutputFile, `commit_short=${commit.slice(0, 7)}\n`);

  // Add commit date to output file.
  fs.appendFileSync(OutputFile, `date=${date.toISOString()}\n`);
  fs.appendFileSync(OutputFile, `date_year=${date.getUTCFullYear()}\n`);
  fs.appendFileSync(OutputFile, `date_month=${(date.getUTCMonth() + 1).toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(OutputFile, `date_day=${date.getUTCDate().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(OutputFile, `date_weekday=${Weekdays[date.getUTCDay()]}\n`);
  fs.appendFileSync(OutputFile, `date_hours=${date.getUTCHours().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(OutputFile, `date_minutes=${date.getUTCMinutes().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(OutputFile, `date_seconds=${date.getUTCSeconds().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(OutputFile, `date_milliseconds=${date.getUTCMilliseconds().toString(10).padStart(3, "0").slice(0, 3)}\n`);

  // Exit
  process.exit(0);
}

//#endregion Run
