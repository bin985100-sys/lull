/** Load route code without rendering hidden lists. Local library navigation then
 * survives a dropped connection, even before these pages were visited. */
export function preloadLibraryScreens(){
 void Promise.allSettled([import('@/app/history'),import('@/app/collection'),import('@/app/favorites'),import('@/app/downloads'),import('@/app/queue'),import('@/app/my/[id]')]);
}
