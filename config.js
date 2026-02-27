export default {
  /** Encrypted Slack webhook URL (base64-encoded KMS ciphertext) */
  kmsEncryptedHookUrl: process.env.KMS_ENCRYPTED_HOOK_URL,
  /** Plaintext Slack webhook URL — use only in non-production environments */
  unencryptedHookUrl: process.env.UNENCRYPTED_HOOK_URL,

  slackChannel: process.env.SLACK_CHANNEL,
  slackUsername: process.env.SLACK_USERNAME ?? 'Slack-CloudWatch-Bot',
  icon_emoji: process.env.EMOJI_ICON ?? ':robot_face:',
  orgIcon: process.env.ORG_ICON,
  orgName: process.env.ORG_NAME,

  services: {
    elasticbeanstalk: { match_text: 'ElasticBeanstalkNotifications' },
    cloudwatch: { match_text: 'CloudWatchNotifications' },
    codepipeline: { match_text: 'CodePipelineNotifications' },
    codedeploy: { match_text: 'CodeDeploy' },
    elasticache: { match_text: 'ElastiCache' },
    autoscaling: { match_text: 'AutoScaling' }
  }
}
