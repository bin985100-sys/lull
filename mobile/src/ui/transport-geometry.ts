/** Lull transport shapes share soft corners at every size, including small list controls. */
export const PLAY_PATH='M9.1 4.5C6.9 3.2 5 4.3 5 6.8v10.4c0 2.5 1.9 3.6 4.1 2.3l9-5.2c2.3-1.3 2.3-3.3 0-4.6Z';
const SKIP_PATH='M7.4 5C5.4 3.9 3.8 4.8 3.8 7.1v9.8c0 2.3 1.6 3.2 3.6 2.1l7.7-4.4c2.3-1.3 2.3-3.9 0-5.2Z';
const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${body}</svg>`;
const skip=`<path d="${SKIP_PATH}"/><rect x="18.1" y="4" width="3.8" height="16" rx="1.9"/>`;
export const TRANSPORT_XML={
 play:svg(`<path d="${PLAY_PATH}"/>`),
 pause:svg('<rect x="4.5" y="3.8" width="6" height="16.4" rx="3"/><rect x="13.5" y="3.8" width="6" height="16.4" rx="3"/>'),
 next:svg(skip),prev:svg(`<g transform="translate(24 0) scale(-1 1)">${skip}</g>`),
};
