export const QUEUE_SWIPE_THRESHOLD=86;
export function queueSwipeOffset(dx:number){'worklet';return Math.max(0,Math.min(112,dx*.85));}
export function shouldQueueSwipe(dx:number,canceled:boolean){'worklet';return !canceled&&dx>=QUEUE_SWIPE_THRESHOLD;}
