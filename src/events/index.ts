import StreamingEvents from './streaming';
import ReactionRolesEvents from './reaction-roles';
import NewMembers from './new-members';

export default [
  ...StreamingEvents,
  ...ReactionRolesEvents,
  ...NewMembers,
];
