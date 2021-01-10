import ReactionRolesJobs from './reaction-roles';

type Jobs = (() => Promise<void>)[];

const jobs: Jobs = [
  ...ReactionRolesJobs,
];

export default jobs;
