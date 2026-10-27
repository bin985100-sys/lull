import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const S = ({ size = 20, children, ...p }: P) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);
const F = ({ size = 20, children, ...p }: P) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    {children}
  </svg>
);


/** Двухтоновая иконка: полупрозрачная заливка формы + контур. Фирменный стиль приложения. */
const D = ({ size = 20, fillPath, children, ...p }: P & { fillPath?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {fillPath && <path d={fillPath} fill="currentColor" stroke="none" opacity={0.24} />}
    {children}
  </svg>
);

export const IHome = (p: P) => <D {...p} fillPath="M4 10.2 12 4l8 6.2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"><path d="M4 10.2 12 4l8 6.2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="15" r="2.2" /></D>;
export const IHomeFill = (p: P) => <F {...p}><path d="M3.4 9.6 11 3.7a1.6 1.6 0 0 1 2 0l7.6 5.9c.4.3.6.8.6 1.3V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19v-8.1c0-.5.2-1 .4-1.3zM12 12.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z" fillRule="evenodd" /></F>;
export const ISearch = (p: P) => <D {...p} fillPath="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" strokeWidth={2.4} /><path d="M8 9a3 3 0 0 1 2.5-1.6" /></D>;
export const ILibrary = (p: P) => <D {...p} fillPath="M5 5h4v14H5z"><rect x="4" y="4" width="5" height="16" rx="1.6" /><rect x="10.5" y="6" width="4" height="14" rx="1.4" /><path d="m16.2 7.4 3.2-.8 1.8 12.2-3.2.8z" /></D>;
export const IWave = (p: P) => <D {...p} fillPath="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"><path d="M5 12h2.2l2-4.5 3.6 9 2.2-6 1.4 1.5H19" /></D>;
export const ISliders = (p: P) => <D {...p} fillPath="M3 5h18v6H3z"><rect x="3" y="4.5" width="18" height="6" rx="3" /><circle cx="15.5" cy="7.5" r="1.6" fill="currentColor" /><rect x="3" y="13.5" width="18" height="6" rx="3" /><circle cx="8.5" cy="16.5" r="1.6" /></D>;
export const IPlay = (p: P) => <F {...p}><path d="M8.2 4.3C6.9 3.5 5.5 4.3 5.5 5.8v12.4c0 1.5 1.4 2.3 2.7 1.5l10-6.2a1.75 1.75 0 0 0 0-3z" /></F>;
export const IPause = (p: P) => <F {...p}><rect x="5.5" y="4.5" width="4.6" height="15" rx="2.3" /><rect x="13.9" y="4.5" width="4.6" height="15" rx="2.3" /></F>;
export const IPrev = (p: P) => <F {...p}><rect x="4.5" y="5" width="3" height="14" rx="1.5" /><path d="M18.5 6.6c0-1.2-1.3-1.9-2.3-1.2l-7.4 5.4a1.5 1.5 0 0 0 0 2.4l7.4 5.4c1 .7 2.3 0 2.3-1.2z" /></F>;
export const INext = (p: P) => <F {...p}><rect x="16.5" y="5" width="3" height="14" rx="1.5" /><path d="M5.5 6.6c0-1.2 1.3-1.9 2.3-1.2l7.4 5.4a1.5 1.5 0 0 1 0 2.4l-7.4 5.4c-1 .7-2.3 0-2.3-1.2z" /></F>;
export const IShuffle = (p: P) => <S {...p}><path d="M3.5 7h3.2c2 0 3.1 1 4.2 2.6l2.2 3.4c1.1 1.7 2.2 2.6 4.2 2.6h2.4" /><path d="M3.5 16.5h3.2c1.4 0 2.3-.5 3.1-1.3M14 8.3c.8-.8 1.7-1.3 3.1-1.3h2.4" /><path d="m17.8 4.6 2.4 2.4-2.4 2.4M17.8 13.2l2.4 2.4-2.4 2.4" /></S>;
export const IRepeat = (p: P) => <S {...p}><path d="M5.2 14.6A7 7 0 0 1 16.8 6.3" /><path d="m17.6 3.2-.6 3.3-3.3-.6" /><path d="M18.8 9.4A7 7 0 0 1 7.2 17.7" /><path d="m6.4 20.8.6-3.3 3.3.6" /></S>;
export const IRepeatOne = (p: P) => <S {...p}><path d="M5.2 14.6A7 7 0 0 1 16.8 6.3" /><path d="m17.6 3.2-.6 3.3-3.3-.6" /><path d="M18.8 9.4A7 7 0 0 1 7.2 17.7" /><path d="m6.4 20.8.6-3.3 3.3.6" /><path d="M11 10.4 12.4 9.4v5.2" strokeWidth={1.9} /></S>;
export const IHeart = (p: P) => <D {...p} fillPath="M12 20s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.4C20 15.2 12 20 12 20z"><path d="M12 20s-8-4.8-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.4C20 15.2 12 20 12 20z" /></D>;
export const IHeartFill = (p: P) => <F {...p}><path d="M12 20s-7.5-4.7-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.3 12 20 12 20z" /></F>;
export const ILyrics = (p: P) => <D {...p} fillPath="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" /><path d="M8 8h8M8 11.5h5" /></D>;
export const IQueue = (p: P) => <D {...p} fillPath="M3 4h12v5H3z"><rect x="3" y="4" width="12" height="5" rx="2" /><path d="M3 13h12M3 18h8" /><path d="M18 12v8M14.5 16.5 18 20l3.5-3.5" /></D>;
export const IVolume = (p: P) => <D {...p} fillPath="M4 9.5h3l4.5-4v13L7 14.5H4z"><path d="M4 9.5h3l4.5-4v13L7 14.5H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /></D>;
export const IVolumeHigh = (p: P) => <D {...p} fillPath="M4 9.5h3l4.5-4v13L7 14.5H4z"><path d="M4 9.5h3l4.5-4v13L7 14.5H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4" /></D>;
export const IMute = (p: P) => <D {...p} fillPath="M4 9.5h3l4.5-4v13L7 14.5H4z"><path d="M4 9.5h3l4.5-4v13L7 14.5H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></D>;
export const IExpand = (p: P) => <D {...p} fillPath="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="m9 14 3-3 3 3" /></D>;
export const IChevronDown = (p: P) => <S {...p}><path d="m6 9 6 6 6-6" /></S>;
export const IChevronLeft = (p: P) => <S {...p}><path d="m15 6-6 6 6 6" /></S>;
export const IChevronRight = (p: P) => <S {...p}><path d="m9 6 6 6-6 6" /></S>;
export const IMore = (p: P) => <F {...p}><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></F>;
export const IMoreH = (p: P) => <F {...p}><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></F>;
export const IPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IMinus = (p: P) => <S {...p}><path d="M5 12h14" /></S>;
export const ISquare = (p: P) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="3" /></S>;
export const IRestore = (p: P) => <S {...p}><rect x="4" y="8" width="12" height="12" rx="2.5" /><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4H17.5A2.5 2.5 0 0 1 20 6.5V13.5A2.5 2.5 0 0 1 17.5 16H16" /></S>;
export const IDownload = (p: P) => <S {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></S>;
export const ICheckCircle = (p: P) => <F {...p}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-4-4 1.4-1.4 2.6 2.6 5.4-5.4 1.4 1.4z" /></F>;
export const IPlayNext = (p: P) => <S {...p}><path d="M5 4v16l9-8zM18 5v14" /></S>;
export const IUser = (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></S>;
export const IDisc = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></S>;
export const ILink = (p: P) => <S {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></S>;
export const ITrash = (p: P) => <S {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></S>;
export const IPin = (p: P) => <F {...p}><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></F>;
export const IEdit = (p: P) => <S {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /></S>;
export const IGrid = (p: P) => <F {...p}><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></F>;
export const IList = (p: P) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></S>;
export const IClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
export const IMoon = (p: P) => <S {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></S>;
export const IGrip = (p: P) => <F {...p}><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></F>;
export const IMusic = (p: P) => <S {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></S>;
export const IExternal = (p: P) => <S {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></S>;
export const ILogo = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M10 9v6l5-3z" fill="currentColor" stroke="none" /></S>;
export const IFlame = (p: P) => <F {...p}><path d="M12 2c.6 3.2-1.2 5-2.7 6.6C7.8 10.2 6 12 6 15a6 6 0 0 0 12 0c0-2.4-1-4.3-2.3-5.7-.2 1.4-.9 2.4-2 2.9.4-3.6-.6-7.4-1.7-10.2z" /></F>;
export const ISparkle = (p: P) => <F {...p}><path d="M12 2.5l2.2 6.1 6.3 2.2-6.3 2.2L12 19.2l-2.2-6.2-6.3-2.2 6.3-2.2z" /></F>;
export const IUsers = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></S>;
export const ISort = (p: P) => <S {...p}><path d="M7 4v16M3 16l4 4 4-4M13 6h8M13 11h6M13 16h3" /></S>;
export const IOpenPlayer = (p: P) => <D {...p} fillPath="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8 15.5h8M9.5 11 12 8.5l2.5 2.5" /></D>;
export const ITune = (p: P) => <D {...p}><path d="M5 20V14M5 10V4M12 20v-6M12 10V4M19 20v-4M19 12V4" /><circle cx="5" cy="12" r="2.2" fill="currentColor" fillOpacity={0.24} /><circle cx="12" cy="12" r="2.2" fill="currentColor" fillOpacity={0.24} /><circle cx="19" cy="14" r="2.2" fill="currentColor" fillOpacity={0.24} /></D>;
export const INote = (p: P) => <F {...p}><path d="M14 3.5v11.3a3.6 3.6 0 1 1-2.2-3.3V5.6c0-1 .7-1.9 1.7-2.1l4-.9c.9-.2 1.5.4 1.5 1.3v1.6c0 .7-.5 1.3-1.2 1.5z" /></F>;
export const IAutoplay = (p: P) => <D {...p} fillPath="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z"><circle cx="12" cy="12" r="9" /><path d="M10 8.6v6.8a.6.6 0 0 0 .9.5l5.2-3.4a.6.6 0 0 0 0-1l-5.2-3.4a.6.6 0 0 0-.9.5z" fill="currentColor" /></D>;
export const ICheck = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>;
/** Галочка подтверждённого исполнителя */
export const IVerified = (p: P) => (
  <svg aria-hidden="true" width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" {...p}>
    <path fill="#3D8BFD" d="M12 1.8l2.4 1.7 2.9-.2 1 2.8 2.5 1.5-.6 2.9 1.3 2.6-2 2.1-.2 2.9-2.9.7-1.6 2.5-2.8-.9-2.8.9-1.6-2.5-2.9-.7-.2-2.9-2-2.1 1.3-2.6-.6-2.9L5.7 6.1l1-2.8 2.9.2z" />
    <path d="m8.2 12.3 2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IShare = (p: P) => <S {...p}><path d="M14 5l6 5.5-6 5.5" /><path d="M20 10.5h-7.5A8.5 8.5 0 0 0 4 19" /></S>;
export const ILibraryAdd = (p: P) => <D {...p} fillPath="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M12 10.5v6M9 13.5h6" /></D>;
export const ILibraryDone = (p: P) => <D {...p} fillPath="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="m9 13.5 2.2 2.2 4-4.2" /></D>;
export const ITrophy = (p: P) => <F {...p}><path d="M7 3h10v2h3a1 1 0 0 1 1 1v1.5A4.5 4.5 0 0 1 16.9 12 5.5 5.5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5.5 5.5 0 0 1 7.1 12 4.5 4.5 0 0 1 3 7.5V6a1 1 0 0 1 1-1h3zm0 4H5v.5A2.5 2.5 0 0 0 7 9.9zm10 0v2.9a2.5 2.5 0 0 0 2-2.4V7z" /></F>;
export const IBookmark = (p: P) => <F {...p}><path d="M6.5 3h11A1.5 1.5 0 0 1 19 4.5v16.2a.8.8 0 0 1-1.3.6L12 17l-5.7 4.3a.8.8 0 0 1-1.3-.6V4.5A1.5 1.5 0 0 1 6.5 3z" /></F>;
export const IAlbum = (p: P) => <F {...p}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 7.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM8.2 5.6a7.6 7.6 0 0 0-2.6 2.6l1.5.9a5.9 5.9 0 0 1 2-2z" fillRule="evenodd" /></F>;
export const IMix = (p: P) => <F {...p}><rect x="3" y="3" width="18" height="18" rx="5" /></F>;
export const IVolumeSolid = (p: P) => <F {...p}><path d="M3.5 9.6c0-.6.5-1.1 1.1-1.1h2.6L11 5.1c.7-.6 1.8-.1 1.8.8v12.2c0 .9-1.1 1.4-1.8.8l-3.8-3.4H4.6c-.6 0-1.1-.5-1.1-1.1z" /><path d="M15.6 9a4 4 0 0 1 0 6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" /></F>;
export const IDislike = (p: P) => <D {...p} fillPath="M4 5.5h3.5v9H4z"><path d="M7.5 14.5V5.5" /><path d="M7.5 5.5h8.2a2 2 0 0 1 2 1.6l1.2 6a2 2 0 0 1-2 2.4h-4.4l.7 3.3a1.8 1.8 0 0 1-3.3 1.3L7.5 14.5H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" /></D>;
/** Значок «Волны» для сайдбара: три бегущие волны */
export const IWaveNav = (p: P) => <S {...p}><path d="M3 9c2-2.6 4-2.6 6 0s4 2.6 6 0 4-2.6 6 0" /><path d="M3 15c2-2.6 4-2.6 6 0s4 2.6 6 0 4-2.6 6 0" opacity={0.55} /></S>;
