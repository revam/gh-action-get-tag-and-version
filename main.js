//#region Imports

const { exec } = require("child_process");
const fs = require("fs");

//#endregion Imports
//#region Setup

// Text coloring for the terminal.
const FormatSuccess = "\x1b[32m%s\x1b[0m";
const FormatWarning = "\x1b[33m%s\x1b[0m";
const FormatError = "\x1b[31m%s\x1b[0m";

const Weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Inputs/outputs.
let {
  // Fallback version. May include the prefix, but can also exclude it.
  INPUT_FALLBACK: FallbackValue = "0.0.0",

  // Optional. The prefix to look for and to set for new tags.
  INPUT_PREFIX: Prefix = "v",

  // Optional. A regex sub-pattern to match multiple prefixes while looking for
  // a match.
  INPUT_PREFIXREGEX: PrefixRegex = "",

  // Optional. The prefix to optionally look for and to set new tags.
  // Excluding it will omit looking for suffixes.
  INPUT_SUFFIX: Suffix = "",

  // Optional. A regex sub-pattern to match multiple suffixes while looking for
  // a match.
  INPUT_SUFFIXREGEX: SuffixRegex = "",

  // Optional. To extract the version from a spesific tag, supply the tag here.
  INPUT_TAG: ref = "",

  // Required. Provided by the action runner normally. We use "/dev/stderr" as a
  // fallback for testing locally.
  GITHUB_OUTPUT: outFile = "/dev/stderr",
} = process.env;

// Optional. Search for tags only on the selected branch.
const perBranch = process.env.INPUT_BRANCH === "true";

// Optional. Static build number supplied by the environment/user.
const StaticBuildNumber = process.env.INPUT_BUILD_NUMBER && !Number.isNaN(parseInt(process.env.INPUT_BUILD_NUMBER, 10)) ? parseInt(process.env.INPUT_BUILD_NUMBER, 10) : null;

// Optional. Auto-incement the version number (and reset the timestamp).
let autoIncrement = process.env.INPUT_INCREMENT && process.env.INPUT_INCREMENT.toLowerCase() !== "false" ? process.env.INPUT_INCREMENT.toLowerCase() : false;
const AutoIncrementSet = new Set(["major", "minor", "patch", "build", "suffix"]);
if (autoIncrement && !AutoIncrementSet.has(autoIncrement)) {
  console.log(FormatError, `Invalid value "${autoIncrement}" supplied to input "increment". Valid values are "${Array.from(AutoIncrementSet).join('", "')}" `);
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

// Create the regex to use for matching.
const tagRegex = Suffix || SuffixRegex ? (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})(?<version>(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)(?:\\-(?<suffix>${SuffixRegex || Suffix}(?:\\.(?<suffixNumber>\\d+))?))?$`)
) : (
  new RegExp(`^(?<prefix>${PrefixRegex || Prefix})(?<version>(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)(?:\\.(?<build>\\d+))?)$`)
);

// Command to run.
const gitCommand = ref ? (
  // Get the tag and version info for the selected tag.
  ref.startsWith("refs") ? (
    `git for-each-ref --sort=-authordate --format="%(refname:short)|||%(authordate)|||%(objectname)" ${ref}`
  ) : (
    `git tag --sort=-authordate --format="%(refname:short)|||%(authordate)|||%(objectname)" --list ${ref}`
  )
) : perBranch ? (
  // Get the tags reachable from the current HEAD.
  'git rev-list --no-commit-header --pretty="%D|||%aI|||%H" HEAD'
) : (
  // Get all the tags in the repository.
  'git for-each-ref --sort=-authordate --format="%(refname:short)|||%(authordate)|||%(objectname)" "refs/tags/*"'
);

//#endregion Setup
//#region Run

exec(gitCommand, (error, stdout, stderr) => {
  if (error) {
    console.log(FormatWarning, "An error occured while trying to find the tags:");
    console.log(FormatError, stderr);
    process.exit(error.code || error.signal || 1);
  }

  // Read the tags from the output.
  let tags = stdout
    .trim()
    .split(/\r\n|\r|\n/g)
    .filter(tag => tag.trim());
  // Additional parsing for ref-parse
  if (perBranch)
    tags = tags
      .flatMap(line => line.split(/, /g))
      .filter(ref => ref.startsWith("tag:") && ref.includes("|||"))
      .map(ref => ref.slice(4).trim());
  if (tags.length === 0) {
    // Exit if we could not find the referenced tag.
    if (ref) {
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

  // Check if any of the found tags match the regex,
  for (const value of tags) {
    const [tag = "", dateText = "", commit = ""] = value.split("|||");
    if (!dateText.trim() || !commit.trim())
      continue;
    const date = new Date(dateText.trim());
    const result = tagRegex.exec(tag);
    if (result)
      return extractVersionFromMatch(result, date, commit);
  }

  console.log(FormatError, "Unable to find a matching tag. Exiting.");
  process.exit(1);
});

/**
 * Extract tag/version info from result, log to the console and set the outputs.
 *
 * @param {RegExpExecArray} result - Result the match stage.
 * @param {Date} date - The timestamp when the tag was committed.
 * @param {string} commit - The commit hash.
 * @returns {never} Will exit upon completion.
 */
function extractVersionFromMatch(result, date, commit) {
  // Extract info from regex result.
  const foundTag = result[0];
  const foundVersion = result.groups.build ? result.groups.version : result.groups.version + ".0";
  let major = parseInt(result.groups.major, 10);
  let minor = parseInt(result.groups.minor, 10);
  let patch = parseInt(result.groups.patch, 10);
  let build = parseInt(result.groups.build || "0", 10);
  let suffixNumber = parseInt(result.groups.suffixNumber || "0", 10);

  // Conditionally auto-increment values.
  switch (autoIncrement) {
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

  // Set the version/tag/timestamp.
  const version = `${major}.${minor}.${patch}.${build}`;
  const versionNoBuild = `${major}.${minor}.${patch}`;
  let prefix = autoIncrement ? Prefix : result.groups.prefix;
  let suffix = autoIncrement ? (
    Suffix && autoIncrement === "suffix" ? (
      Suffix + "." + suffixNumber
    ) : (
      Suffix
    )
  ) : (
    result.groups.suffix && result.groups.suffixNumber ? (
      result.groups.suffix + "." + result.groups.suffixNumber
    ) : (
      result.groups.suffix || ""
    )
  );
  let tag = foundTag;
  if (autoIncrement) {
    tag = `${prefix}${major}.${minor}.${patch}`;
    if (build > 0 && autoIncrement !== "suffix")
      tag += `.${build}`;
    if (suffix)
      tag += `-${suffix}`;
  }

  // Log info to console.
  console.log(FormatSuccess, `Found tag: ${foundTag}`);
  console.log(FormatSuccess, `Found version: ${foundVersion}`);
  if (autoIncrement) {
    console.log(FormatSuccess, `Next tag: ${tag}`);
    console.log(FormatSuccess, `Next version: ${version}`);
  }

  // Add tag to output file
  fs.appendFileSync(outFile, `tag=${tag}\n`);
  fs.appendFileSync(outFile, `tag_prefix=${prefix}\n`);
  fs.appendFileSync(outFile, `tag_suffix=${suffix}\n`);

  // Add version to output file.
  fs.appendFileSync(outFile, `version=${version}\n`);
  fs.appendFileSync(outFile, `version_short=${versionNoBuild}\n`);
  fs.appendFileSync(outFile, `version_major=${major}\n`);
  fs.appendFileSync(outFile, `version_minor=${minor}\n`);
  fs.appendFileSync(outFile, `version_patch=${patch}\n`);
  fs.appendFileSync(outFile, `version_build=${build}\n`);

  // Add commit hash to output file.
  fs.appendFileSync(outFile, `commit=${commit}\n`);
  fs.appendFileSync(outFile, `commit_short=${commit.slice(0, 7)}\n`);

  // Add commit date to output file.
  fs.appendFileSync(outFile, `date=${date.toISOString()}\n`);
  fs.appendFileSync(outFile, `date_year=${date.getUTCFullYear()}\n`);
  fs.appendFileSync(outFile, `date_month=${(date.getUTCMonth() + 1).toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(outFile, `date_day=${date.getUTCDate().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(outFile, `date_weekday=${Weekdays[date.getUTCDay()]}\n`);
  fs.appendFileSync(outFile, `date_hours=${date.getUTCHours().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(outFile, `date_minutes=${date.getUTCMinutes().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(outFile, `date_seconds=${date.getUTCSeconds().toString(10).padStart(2, "0")}\n`);
  fs.appendFileSync(outFile, `date_milliseconds=${date.getUTCMilliseconds().toString(10).padStart(3, "0").slice(0, 3)}\n`);

  // Exit
  process.exit(0);
}

//#endregion Run
