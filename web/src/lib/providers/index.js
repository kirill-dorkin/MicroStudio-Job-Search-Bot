import * as remotive from './remotive';
import * as arbeitnow from './arbeitnow';
import * as remoteok from './remoteok';

const providers = [remotive, arbeitnow, remoteok];

export const providerMap = providers.reduce((acc, provider) => {
  if (provider?.PROVIDER_ID) {
    acc[provider.PROVIDER_ID] = provider;
  }
  return acc;
}, {});

export default providers;
