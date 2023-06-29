import StreamingEvents from './streaming';
import ReactionRolesEvents from './reaction-roles';
import NewMembers from './new-members';
import Dms from './dms';

export default [
  ...StreamingEvents,
  ...ReactionRolesEvents,
  ...NewMembers,
  ...Dms,
];
