const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

exec('aws logs describe-log-groups --region eu-west-1', { env: process.env }, (err, stdout, stderr) => {
  if (err) return console.error(err)

  const resultJSON = JSON.parse(stdout)
  const desiredLogGroupNames = resultJSON.logGroups.filter((lg) => lg.logGroupName.indexOf(require('./package.json').name) < 0 && lg.logGroupName.indexOf('lambda') > -1).map((lg) => {
    const splitted = lg.logGroupName.split('/')
    return splitted[splitted.length - 1]
  })

  const appSam = require('./app-sam.json')

  if (desiredLogGroupNames.length > 0) {
    const template = JSON.parse(JSON.stringify(appSam.Resources.LambdaErrorAlarm))
    delete appSam.Resources.LambdaErrorAlarm

    desiredLogGroupNames.forEach((fn, i) => {
      appSam.Resources[`LambdaErrorAlarm${i}`] = JSON.parse(JSON.stringify(template))
      appSam.Resources[`LambdaErrorAlarm${i}`].Properties.AlarmName = `${fn}-lambda-errors`
      appSam.Resources[`LambdaErrorAlarm${i}`].Properties.Dimensions = [{ Name: 'FunctionName', Value: fn }]
    })
  }

  fs.writeFile(path.join(__dirname, 'app-sam-with-alarms.json'), JSON.stringify(appSam, null, 2), (err) => {
    if (err) console.error(err)
  })
})
