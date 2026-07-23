/**
 * Developer roster — powers the "Developed By" section on the About screen.
 *
 * ── To update the team ──────────────────────────────────────────────
 * Edit the array below directly:
 *   - Change `name`, `role`, or `description` for any existing member.
 *   - Add a new object to the array to add a member.
 *   - Remove an object to remove a member.
 * The About screen re-renders automatically from whatever is here —
 * no changes to AboutScreen.jsx are ever needed.
 *
 * ── To add a real profile photo ─────────────────────────────────────
 *   1. Drop the image file into `assets/developers/` (e.g. james.jpg).
 *   2. Replace that developer's `photo: null` with a local require, e.g.:
 *        photo: require('../../assets/developers/james.jpg'),
 *   Leaving `photo: null` shows an automatic initials avatar instead,
 *   so this is safe to leave blank until real photos are ready.
 */
export const DEVELOPERS = [
  {
    name: 'James Ivan Jimenez',
    role: 'Project Manager',
    description: '',
    photo: null, // e.g. require('../../assets/developers/james.jpg')
  },
  {
    name: 'John Albert Tabasa',
    role: 'Lead Developer',
    description: '',
    photo: null, // e.g. require('../../assets/developers/john.jpg')
  },
  {
    name: 'Timothy John Largo',
    role: 'UI/UX Designer',
    description: '',
    photo: null, // e.g. require('../../assets/developers/timothy.jpg')
  },
  {
    name: 'June Angelo Pogio',
    role: 'Tester', // not specified — change to the correct role
    description: '',
    photo: null, // e.g. require('../../assets/developers/june.jpg')
  },
];