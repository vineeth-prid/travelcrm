import { createApiClient } from '@travel-crm/sdk';

import { publicEnv } from './env';

/** Browser client — the session cookie travels automatically. */
export const api = createApiClient({ baseUrl: publicEnv.apiUrl });
