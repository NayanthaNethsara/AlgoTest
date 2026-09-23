import type { User } from "./user";

export type Team = {
  id: string;
  name: string;
  createdAt: string;
  members?: User[];
};

export type CreateTeamInput = {
  name: string;
  members?: Array<{
    username: string;
    displayName?: string;
    password?: string;
  }>;
};
