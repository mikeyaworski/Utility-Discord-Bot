import ReactionRolesJobs from './reaction-roles';
import RemindersJobs from './reminders';

type Jobs = (() => Promise<void>)[];

const jobs: Jobs = [
  ...ReactionRolesJobs,
  ...RemindersJobs,
];

export default jobs;
