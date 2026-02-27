import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms'
import config from './config.js'

// Cached across warm Lambda invocations
let hookUrl

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

const baseSlackMessage = {
  channel: config.slackChannel,
  username: config.slackUsername,
  icon_emoji: config.icon_emoji,
  attachments: [
    {
      footer: config.orgName,
      footer_icon: config.orgIcon
    }
  ]
}

/**
 * Deep-merges two plain objects/arrays, returning a new value.
 * Arrays are concatenated; plain objects are merged recursively.
 */
function merge (target, source) {
  if (typeof target !== 'object' || typeof source !== 'object') return source ?? target

  if (Array.isArray(target) && Array.isArray(source)) return [...target, ...source]

  const result = { ...target }
  for (const [key, srcVal] of Object.entries(source)) {
    const tgtVal = result[key]
    result[key] =
      tgtVal !== null && srcVal !== null &&
      typeof tgtVal === 'object' && typeof srcVal === 'object'
        ? merge(tgtVal, srcVal)
        : srcVal
  }
  return result
}

function buildMessage (partial) {
  return merge(partial, baseSlackMessage)
}

/** POST a Slack message to the webhook and return the response. */
async function postMessage (message) {
  const response = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  })

  if (!response.ok && response.status >= 500) {
    throw new Error(`Slack server error: ${response.status} ${response.statusText}`)
  }

  if (!response.ok) {
    // 4xx — bad request, log and move on (don't retry)
    console.error(`Slack API error: ${response.status} ${response.statusText}`)
  } else {
    console.info('Message posted successfully')
  }

  return response
}

// ---------------------------------------------------------------------------
// SNS record accessor helpers
// ---------------------------------------------------------------------------

function getSnsRecord (event) {
  return event.Records[0].Sns
}

function getTimestamp (event) {
  return new Date(getSnsRecord(event).Timestamp).getTime() / 1000
}

function getRegion (event) {
  return event.Records[0].EventSubscriptionArn.split(':')[3]
}

// ---------------------------------------------------------------------------
// Per-service handlers
// ---------------------------------------------------------------------------

function handleElasticBeanstalk (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const subject = sns.Subject ?? 'AWS Elastic Beanstalk Notification'
  const message = sns.Message

  const dangerPatterns = [
    ' to RED', ' to Severe', ' but with errors',
    'You do not have permission', 'Failed to deploy application',
    'Failed to deploy configuration',
    'Your quota allows for 0 more running instance',
    'Unsuccessful command execution'
  ]
  const warningPatterns = [
    ' to YELLOW', ' to Degraded', ' to Info',
    'Removed instance ', 'Adding instance ',
    ' aborted operation.',
    'some instances may have deployed the new application version'
  ]

  let color = 'good'
  if (dangerPatterns.some(p => message.includes(p))) color = 'danger'
  else if (warningPatterns.some(p => message.includes(p))) color = 'warning'

  return buildMessage({
    text: `*${subject}*`,
    attachments: [{
      color,
      ts: timestamp,
      fields: [
        { title: 'Subject', value: sns.Subject, short: false },
        { title: 'Message', value: message, short: false }
      ]
    }]
  })
}

function handleCodeDeploy (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const fields = []
  let color = 'warning'

  try {
    const message = JSON.parse(sns.Message)
    if (message.status === 'SUCCEEDED') color = 'good'
    else if (message.status === 'FAILED') color = 'danger'

    fields.push(
      { title: 'Message', value: sns.Subject, short: false },
      { title: 'Deployment Group', value: message.deploymentGroupName, short: true },
      { title: 'Application', value: message.applicationName, short: true },
      {
        title: 'Status Link',
        value: `https://console.aws.amazon.com/codedeploy/home?region=${message.region}#/deployments/${message.deploymentId}`,
        short: false
      }
    )
  } catch {
    color = 'good'
    fields.push(
      { title: 'Message', value: sns.Subject, short: false },
      { title: 'Detail', value: sns.Message, short: false }
    )
  }

  return buildMessage({
    text: '*AWS CodeDeploy Notification*',
    attachments: [{ color, fields, ts: timestamp }]
  })
}

function handleCodePipeline (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const fields = []
  let color = 'warning'

  try {
    const message = JSON.parse(sns.Message)
    const detailType = message['detail-type']

    let changeType = ''
    if (detailType === 'CodePipeline Stage Execution State Change') {
      changeType = `STAGE ${message.detail.stage}`
    } else if (detailType === 'CodePipeline Action Execution State Change') {
      changeType = 'ACTION'
    }

    if (message.detail.state === 'SUCCEEDED') color = 'good'
    else if (message.detail.state === 'FAILED') color = 'danger'

    const header = `${message.detail.state}: CodePipeline ${changeType}`.trim()
    fields.push(
      { title: 'Message', value: header, short: false },
      { title: 'Pipeline', value: message.detail.pipeline, short: true },
      { title: 'Region', value: message.region, short: true },
      {
        title: 'Status Link',
        value: `https://console.aws.amazon.com/codepipeline/home?region=${message.region}#/view/${message.detail.pipeline}`,
        short: false
      }
    )
  } catch {
    color = 'good'
    fields.push(
      { title: 'Message', value: sns.Subject, short: false },
      { title: 'Detail', value: sns.Message, short: false }
    )
  }

  return buildMessage({
    text: '*AWS CodePipeline Notification*',
    attachments: [{ color, fields, ts: timestamp }]
  })
}

function handleElasticache (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const region = getRegion(event)
  const message = JSON.parse(sns.Message)

  const [rawKey, nodename] = Object.entries(message)[0]
  const eventname = rawKey.split(':')[1]

  return buildMessage({
    text: '*AWS ElastiCache Notification*',
    attachments: [{
      color: 'good',
      ts: timestamp,
      fields: [
        { title: 'Event', value: eventname, short: true },
        { title: 'Node', value: nodename, short: true },
        {
          title: 'Link to cache node',
          value: `https://console.aws.amazon.com/elasticache/home?region=${region}#cache-nodes:id=${nodename};nodes`,
          short: false
        }
      ]
    }]
  })
}

function handleCloudWatch (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const region = getRegion(event)
  const message = JSON.parse(sns.Message)
  const { AlarmName, Trigger, OldStateValue, NewStateValue, NewStateReason } = message

  let color = 'warning'
  if (NewStateValue === 'ALARM') color = 'danger'
  else if (NewStateValue === 'OK') color = 'good'

  return buildMessage({
    text: '*AWS CloudWatch Notification*',
    attachments: [{
      color,
      ts: timestamp,
      fields: [
        { title: 'Alarm Name', value: AlarmName, short: true },
        { title: 'Alarm Description', value: NewStateReason, short: false },
        {
          title: 'Trigger',
          value: `${Trigger.Statistic} ${Trigger.MetricName} ${Trigger.ComparisonOperator} ${Trigger.Threshold} for ${Trigger.EvaluationPeriods} period(s) of ${Trigger.Period} seconds.`,
          short: false
        },
        { title: 'Old State', value: OldStateValue, short: true },
        { title: 'Current State', value: NewStateValue, short: true },
        {
          title: 'Link to Alarm',
          value: `https://console.aws.amazon.com/cloudwatch/home?region=${region}#alarm:alarmFilter=ANY;name=${encodeURIComponent(AlarmName)}`,
          short: false
        }
      ]
    }]
  })
}

function handleAutoScaling (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  const message = JSON.parse(sns.Message)

  return buildMessage({
    text: '*AWS AutoScaling Notification*',
    attachments: [{
      color: 'good',
      ts: timestamp,
      fields: [
        { title: 'Message', value: sns.Subject, short: false },
        { title: 'Description', value: message.Description, short: false },
        { title: 'Event', value: message.Event, short: false },
        { title: 'Cause', value: message.Cause, short: false }
      ]
    }]
  })
}

function handleCatchAll (event) {
  const sns = getSnsRecord(event)
  const timestamp = getTimestamp(event)
  let message
  let color = 'warning'

  try {
    message = JSON.parse(sns.Message)
    if (message.NewStateValue === 'ALARM') color = 'danger'
    else if (message.NewStateValue === 'OK') color = 'good'
  } catch {
    message = { raw: sns.Message }
  }

  const description = Object.entries(message)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n')

  return buildMessage({
    text: `*${sns.Subject ?? 'AWS Notification'}*`,
    attachments: [{
      color,
      ts: timestamp,
      fields: [
        { title: 'Message', value: sns.Subject, short: false },
        { title: 'Description', value: description, short: false }
      ]
    }]
  })
}

// ---------------------------------------------------------------------------
// Event router
// ---------------------------------------------------------------------------

function routeEvent (event) {
  const sns = getSnsRecord(event)
  const arn = event.Records[0].EventSubscriptionArn
  const subject = sns.Subject ?? ''
  const message = sns.Message ?? ''

  const matches = (svc) => {
    const t = config.services[svc].match_text
    return arn.includes(t) || subject.includes(t) || message.includes(t)
  }

  let parsedMessage
  try {
    if (message.startsWith('{') && message.endsWith('}')) {
      parsedMessage = JSON.parse(message)
    }
  } catch { /* ignore */ }

  if (matches('codepipeline')) {
    console.log('processing codepipeline notification')
    return handleCodePipeline(event)
  }

  if (matches('elasticbeanstalk')) {
    console.log('processing elasticbeanstalk notification')
    return handleElasticBeanstalk(event)
  }

  if (parsedMessage?.AlarmName !== undefined && parsedMessage?.AlarmDescription !== undefined) {
    console.log('processing cloudwatch notification')
    return handleCloudWatch(event)
  }

  if (matches('codedeploy')) {
    console.log('processing codedeploy notification')
    return handleCodeDeploy(event)
  }

  if (matches('elasticache')) {
    console.log('processing elasticache notification')
    return handleElasticache(event)
  }

  if (matches('autoscaling')) {
    console.log('processing autoscaling notification')
    return handleAutoScaling(event)
  }

  console.log('processing catch-all notification')
  return handleCatchAll(event)
}

async function processEvent (event) {
  console.log('sns received:', JSON.stringify(event, null, 2))
  const slackMessage = routeEvent(event)
  await postMessage(slackMessage)
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

async function resolveHookUrl () {
  if (hookUrl) return // already cached

  if (config.unencryptedHookUrl) {
    hookUrl = config.unencryptedHookUrl
    return
  }

  if (config.kmsEncryptedHookUrl && config.kmsEncryptedHookUrl !== '<kmsEncryptedHookUrl>') {
    const kmsClient = new KMSClient()
    const encryptedBuf = Buffer.from(config.kmsEncryptedHookUrl, 'base64')
    const { Plaintext } = await kmsClient.send(new DecryptCommand({ CiphertextBlob: encryptedBuf }))
    // AWS SDK v3 returns Plaintext as Uint8Array — wrap in Buffer before calling toString()
    hookUrl = 'https://' + Buffer.from(Plaintext).toString('ascii')
    return
  }

  throw new Error('Hook URL has not been configured. Set KMS_ENCRYPTED_HOOK_URL or UNENCRYPTED_HOOK_URL.')
}

export const handler = async function (event) {
  await resolveHookUrl()
  await processEvent(event)
}
