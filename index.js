const github = require("@actions/github");
const core = require("@actions/core");
const { Octokit } = require("@octokit/rest");
const slack = require("slack-notify")(core.getInput("webhook_url"));

const token = core.getInput("github_token");
const octokit = new Octokit({ auth: token });
const repo = github.context.repo;

function slackSuccessMessage(source, target, status) {
  return {
    color: "#2EB67D",
    message: `🚀 [${source}] was successfully merged into [${target}].`,
  };
}

function slackErrorMessage(source, target, status) {
  return {
    color: "#E01E5A",
    message: `[${source}] has confilct with Branch: [${target}].`,
    description:
      "🚨 Multi deploy has failed, this is an emergency, contact for help <-@ian> <-@jamie>",
  };
}

async function slackMessage(source, target, status) {
  if (core.getInput("webhook_url")) {
    let payload =
      status == "success"
        ? slackSuccessMessage(source, target, status)
        : slackErrorMessage(source, target, status);

    slack.send({
      icon_emoji: payload.icon,
      username: payload.message,
      attachments: [
        {
          author_name: github.context.payload.repository.full_name,
          author_link: `https://github.com/${github.context.payload.repository.full_name}/`,
          title: payload.message,
          text: payload.description,
          color: payload.color,
          // fields: [{ title: "Job Status", value: status, short: false }],
        },
      ],
    });
  }
}

async function merge(source, target) {
  core.info(`merge branch:${source} to: ${target}`);
  core.info("Function: merge branch:", source, "to:", target);
  const response = await octokit.repos.merge({
    owner: repo.owner,
    repo: repo.repo,
    base: target,
    head: source,
    commit_message: `GitHub Action: Merged '${source}' into '${target}'.`,
  });
}

async function run() {
  const source = core.getInput("source");
  const target = core.getInput("target");
  core.info(`merge ${source} into ${target}`);

  try {
    await merge(source, target);
    await slackMessage(source, target, "success");
    await slackMessage(source, target, "failure");
  } catch (error) {
    await slackMessage(source, target, "failure");
    core.setFailed(`${source} merge failed: ${error.message}`);
  }
}

run();
