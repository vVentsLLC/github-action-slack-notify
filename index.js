const core = require('@actions/core')
const github = require('@actions/github')
const SlackClient = require('@slack/web-api').WebClient

async function getChannelId({ slack, channel, types = 'public_channel, private_channel' }) {
  channel = channel.replace(/[#@]/g, '')

  for await (const page of slack.paginate('conversations.list', { types })) {
    const result = page.channels.find(it => it.name === channel)
    if (result) return result.id
  }
}

function buildSlackAttachments({ status, color }) {
  const { payload, repo: { owner, repo }, ref, workflow, eventName } = github.context
  const event = eventName
  const branch = event === 'pull_request' ? payload.pull_request.head.ref : ref.replace('refs/heads/', '')
  const sha = event === 'pull_request' ? payload.pull_request.head.sha : github.context.sha

  const referenceLink =
    event === 'pull_request'
      ? {
        title: 'Pull Request',
        value: `<${payload.pull_request.html_url} | ${payload.pull_request.title}>`,
        short: true,
      }
      : {
        title: 'Branch',
        value: `<https://github.com/${owner}/${repo}/commit/${sha} | ${owner}/${repo}#${branch}>`,
        short: true,
      }

  return [
    {
      color,
      fields: [
        {
          title: 'Action',
          value: `<https://github.com/${owner}/${repo}/commit/${sha}/checks | ${workflow}>`,
          short: true,
        },
        {
          title: 'Status',
          value: status,
          short: true,
        },
        referenceLink,
        {
          title: 'Event',
          value: event,
          short: true,
        },
      ],
      footer_icon: 'https://github.githubassets.com/favicon.ico',
      footer: `<https://github.com/${owner}/${repo} | ${owner}/${repo}>`,
      ts: Math.floor(Date.now() / 1000),
    },
  ]
}

async function run () {
  const channel = core.getInput('channel')
  const text = core.getInput('text')
  const status = core.getInput('status')
  const color = core.getInput('color')
  const messageId = core.getInput('messageId')
  const token = core.getInput('token')

  if (!token) {
    core.setFailed(`You must a slack bot token.`)
    return
  }

  const slack = new SlackClient(token)

  if (!channel && !core.getInput('channelId')) {
    core.setFailed(`You must provider either a 'channel' or a 'channelId'.`)
    return
  }

  const attachments = buildSlackAttachments({ status, color })
  const channelId = core.getInput('channelId') || (await getChannelId({ slack, channel }))

  if (!channelId) {
    core.setFailed(`Slack channel ${channel} could not be found.`)
    return
  }

  const apiMethod = Boolean(messageId) ? 'update' : 'postMessage'
  const args = {
    channel: channelId,
    attachments,
  }

  if (messageId) {
    args.ts = messageId
  }

  if (text) {
    args.text = text
  }

  const response = await slack.chat[apiMethod](args)

  core.setOutput('messageId', response.ts)
}

run().catch(error => {
  console.error(error)
  core.setFailed(error.message)
})
