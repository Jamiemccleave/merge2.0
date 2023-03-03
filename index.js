const github = require("@actions/github");
const core = require("@actions/core");
const { Octokit } = require("@octokit/rest");

const slack = require("slack-notify")(core.getInput("webhook_url"));

const token = core.getInput("github_token");
const octokit = new Octokit({ auth: token });
// const repo = github.context.repo;
const hook = core.getInput("webhook_url");

function slackSuccessMessage(source, target, status) {
  return {
    color: "#2EB67D",
    message: `🚀 [${source}] was successfully merged into [${target}].`,
  };
}

function slackErrorMessage(source, target, status) {
  return {
    color: "#E01E5A",
    message: `Branch: [${source}] has confilct with Branch: [${target}].`,
    description:
      "🚨 Multi deploy has failed, this is an emergency, contact for help <-@ian> <-@jamie>",
  };
}

async function slackMessage(source, target, status) {
  if (hook) {
    let payload =
      status == "success"
        ? slackSuccessMessage(source, target, status)
        : slackErrorMessage(source, target, status);

    slack.send({
      username: payload.message,
      attachments: [
        {
          author_name: github.context.payload.repository.full_name,
          author_link: `https://github.com/${github.context.payload.repository.full_name}/`,
          title: payload.message,
          text: payload.description,
          color: payload.color,
        },
      ],
    });
  }
}

async function merge(source, target) {
  core.info(`merge branch:${source} to: ${target}`);
  core.info("Function: merge branch:", source, "to:", target);

  // set the owner and repo of the repository
  const owner = github.context.repo.owner;
  const repo = github.context.repo;

  // set the branch names for the merge
  const base = target;
  const head = source;

  // merge the branches without committing the changes
  const { data: mergeData } = await octokit.repos.merge({
    owner,
    repo,
    base,
    head,
    merge_method: "merge",
    commit_message: "Merge branches",
  });

  // get the current commit SHA for the branch
  const { data: branchData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${head}`,
  });

  const commitSHA = branchData.object.sha;

  // define an array of file paths to checkout
  const filePaths = [
    "config/settings_data.json",
    "templates/*.json",
    "locales/*.json",
  ];

  // get the content of the files at the previous commit SHA
  const fileData = await Promise.all(
    filePaths.map(async (path) => {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: "PREVIOUS_COMMIT_SHA",
      });

      const content = Buffer.from(data.content, "base64").toString();

      return {
        path,
        content,
      };
    })
  );

  // create new blobs for the contents of the files
  const blobTree = await Promise.all(
    fileData.map(async ({ path, content }) => {
      const { data } = await octokit.git.createBlob({
        owner,
        repo,
        content,
        encoding: "utf-8",
      });

      return {
        path,
        mode: "100644",
        type: "blob",
        sha: data.sha,
      };
    })
  );

  // create a new tree with the updated file contents
  const { data: treeData } = await octokit.git.createTree({
    owner,
    repo,
    tree: blobTree,
    base_tree: commitSHA,
  });

  // create a new commit with the updated tree and previous commit as parents
  const { data: commitData } = await octokit.git.createCommit({
    owner,
    repo,
    message: "Merge with updated files",
    tree: treeData.sha,
    parents: [commitSHA, mergeData.sha],
  });

  // update the branch reference to point to the new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${head}`,
    sha: commitData.sha,
  });

  // push the changes to the branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${head}`,
    sha: commitData.sha,
  });
}

async function run() {
  const source = core.getInput("source");
  const target = core.getInput("target");
  core.info(`merge ${source} into ${target}`);

  try {
    await merge(source, target);
    await slackMessage(source, target, "success");
  } catch (error) {
    await slackMessage(source, target, "failure");
    console.log(error);
    core.setFailed(`${source} merge failed: ${error.message}`);
  }
}

run();
