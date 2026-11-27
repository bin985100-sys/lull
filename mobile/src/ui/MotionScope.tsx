import { createContext, type ReactNode, useContext } from 'react';
const Visibility=createContext(true);
/** Scrolling, covered and offscreen feed cells never run decorative loops. */
export function MotionScope({active,children}:{active:boolean;children:ReactNode}){return <Visibility.Provider value={active}>{children}</Visibility.Provider>;}
export const useMotionVisible=()=>useContext(Visibility);
