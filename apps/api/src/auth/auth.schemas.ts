import { z } from 'zod';

import { userSchema } from '../users/users.schemas';

export const loginResponseSchema = z.object({ user: userSchema });
