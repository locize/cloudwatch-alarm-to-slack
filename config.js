export default {
  kmsEncryptedHookUrl: process.env.KMS_ENCRYPTED_HOOK_URL, // encrypted slack webhook url
  unencryptedHookUrl: process.env.UNENCRYPTED_HOOK_URL, // unencrypted slack webhook url

  slackChannel: process.env.SLACK_CHANNEL,
  slackUsername: process.env.SLACK_USERNAME || 'Slack-CloudWatch-Bot',
  icon_emoji: process.env.EMOJI_ICON || ':robot_face:',
  orgIcon: process.env.ORG_ICON,
  orgName: process.env.ORG_NAME,

  services: {
    elasticbeanstalk: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'ElasticBeanstalkNotifications'
    },
    cloudwatch: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'CloudWatchNotifications'
    },
    codepipeline: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'CodePipelineNotifications'
    },
    codedeploy: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'CodeDeploy'
    },
    elasticache: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'ElastiCache'
    },
    autoscaling: {
      // text in the sns message or topicname to match on to process this service type
      match_text: 'AutoScaling'
    }
  }
}
