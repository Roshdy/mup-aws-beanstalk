## mup-aws-beanstalk

Plugin for Meteor Up to deploy using AWS Beanstalk.

Features:
- Load balancing with support for sticky sessions and web sockets
- Autoscaling
- Meteor settings.json
- Zero downtime deploys
- Automatically uses the correct node version

[Getting Started Guide](./docs/getting-started.md)

[Documentation](./docs/index.md)


## UPDATE :: (Using Launch Templates)

**Key Changes:**
- `createLaunchTemplateFromConfig`:

  Converts the ***launch configuration*** to a ***launch template***.
- Integration in `createDesiredConfig`:

  Added a reference to the ***Launch Template*** in `OptionSettings` under `aws:autoscaling:launchtemplate`.
- Conditional Template Conversion:
  
  In `prepareUpdateEnvironment`, the script checks for `launchConfigName` and `launchTemplateName` and performs the conversion.
- Replaced ***Launch Configuration*** Reference:

  Adjusted `roleName` to pull settings from `aws:autoscaling:launchtemplate` instead of `launchconfiguration`.
- Added ***Launch Template*** Specification:

  The ***LaunchTemplate*** property is used to reference the `LaunchTemplateId` and its version dynamically.
- Dynamic Defaults:

  Default values (`<launch-template-id>` and `version`) are included as fallbacks to ensure flexibility during deployment.

## Usage
- Set `launchConfigName` or `launchTemplateName` in `mup.js` under `app`
- Ensure that your **Elastic Beanstalk environment settings** include options for `LaunchTemplateId` and `LaunchTemplateVersion` to dynamically pull these `configurations`.
