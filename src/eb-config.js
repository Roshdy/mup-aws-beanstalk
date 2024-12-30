import { difference } from 'lodash';
import { beanstalk } from './aws';
import downloadEnvFile from './download';
import { createEnvFile } from './env-settings';
import { uploadEnvFile } from './upload';
import { names } from './utils';
import { largestEnvVersion } from './versions';
import AWS from 'aws-sdk';

const ec2 = new AWS.EC2();
const autoscaling = new AWS.AutoScaling();

export async function createLaunchTemplateFromConfig(launchConfigName, launchTemplateName) {
  // Fetch existing Launch Configuration details
  const { LaunchConfigurations } = await autoscaling.describeLaunchConfigurations({
    LaunchConfigurationNames: [launchConfigName],
  }).promise();

  if (!LaunchConfigurations.length) {
    throw new Error(`Launch Configuration ${launchConfigName} not found`);
  }

  const launchConfig = LaunchConfigurations[0];

  // Create a Launch Template based on the Launch Configuration
  const params = {
    LaunchTemplateName: launchTemplateName,
    LaunchTemplateData: {
      ImageId: launchConfig.ImageId,
      InstanceType: launchConfig.InstanceType,
      KeyName: launchConfig.KeyName,
      SecurityGroupIds: launchConfig.SecurityGroups,
      IamInstanceProfile: {
        Name: launchConfig.IamInstanceProfile,
      },
      UserData: launchConfig.UserData,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: launchConfig.Tags,
        },
      ],
    },
  };

  const { LaunchTemplate } = await ec2.createLaunchTemplate(params).promise();
  console.log(`Launch Template ${LaunchTemplate.LaunchTemplateName} created successfully`);
  return LaunchTemplate;
}

export function createDesiredConfig(mupConfig, settings, longEnvVarsVersion) {
  const {
    env,
    instanceType,
    customBeanstalkConfig = [],
    launchConfigName,
    launchTemplateName,
  } = mupConfig.app;
  const { instanceProfile, serviceRole } = names(mupConfig);

  const config = {
    OptionSettings: [
      {
        Namespace: 'aws:autoscaling:trigger',
        OptionName: 'MeasureName',
        Value: 'CPUUtilization',
      },
      {
        Namespace: 'aws:autoscaling:trigger',
        OptionName: 'Statistic',
        Value: 'Average',
      },
      {
        Namespace: 'aws:autoscaling:trigger',
        OptionName: 'UpperThreshold',
        Value: '75',
      },
      {
        Namespace: 'aws:autoscaling:trigger',
        OptionName: 'LowerThreshold',
        Value: '35',
      },
      {
        Namespace: 'aws:elasticbeanstalk:environment',
        OptionName: 'EnvironmentType',
        Value: 'LoadBalanced',
      },
      {
        Namespace: 'aws:elasticbeanstalk:environment',
        OptionName: 'LoadBalancerType',
        Value: 'application',
      },
      {
        Namespace: 'aws:elasticbeanstalk:command',
        OptionName: 'DeploymentPolicy',
        Value: 'RollingWithAdditionalBatch',
      },
      {
        Namespace: 'aws:autoscaling:updatepolicy:rollingupdate',
        OptionName: 'RollingUpdateEnabled',
        Value: 'true',
      },
      {
        Namespace: 'aws:elasticbeanstalk:environment',
        OptionName: 'ServiceRole',
        Value: serviceRole,
      },
      {
        Namespace: 'aws:autoscaling:launchtemplate',
        OptionName: 'LaunchTemplateId',
        Value: launchTemplateName, // Reference to the new Launch Template
      },
    ],
  };

  const settingsString = JSON.stringify(settings);

  if (longEnvVarsVersion) {
    config.OptionSettings.push({
      Namespace: 'aws:elasticbeanstalk:application:environment',
      OptionName: 'MUP_ENV_FILE_VERSION',
      Value: longEnvVarsVersion.toString(),
    });
  } else {
    env.METEOR_SETTINGS_ENCODED = encodeURIComponent(settingsString);

    Object.keys(env).forEach((envName) => {
      const value = env[envName];
      config.OptionSettings.push({
        Namespace: 'aws:elasticbeanstalk:application:environment',
        OptionName: envName,
        Value: value.toString(),
      });
    });
  }

  const customOptions = customBeanstalkConfig.map((option) => ({
    Namespace: option.namespace,
    OptionName: option.option,
    Value: option.value,
  }));

  config.OptionSettings = mergeConfigs(config.OptionSettings, customOptions);

  return config;
}

// Include other utility functions like scalingConfigChanged, scalingConfig, etc., as needed

export async function prepareUpdateEnvironment(api) {
  const config = api.getConfig();
  const { app, environment, bucket } = names(config);

  const { ConfigurationSettings } = await beanstalk.describeConfigurationSettings({
    EnvironmentName: environment,
    ApplicationName: app,
  }).promise();

  const { longEnvVars, launchConfigName, launchTemplateName } = config.app;

  if (launchConfigName && launchTemplateName) {
    console.log('Converting Launch Configuration to Launch Template...');
    await createLaunchTemplateFromConfig(launchConfigName, launchTemplateName);
  }

  const desiredEbConfig = createDesiredConfig(
    api.getConfig(),
    api.getSettings(),
    longEnvVars ? await largestEnvVersion(api) : 0
  );

  const { toRemove, toUpdate } = diffConfig(
    ConfigurationSettings[0].OptionSettings,
    desiredEbConfig.OptionSettings
  );

  return {
    toRemove,
    toUpdate,
  };
}
