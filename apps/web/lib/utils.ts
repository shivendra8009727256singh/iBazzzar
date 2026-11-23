import {clsx,type ClassValue} from 'clsx';
import {twMerge} from 'tailwind-merge';
export const cn=(...inputs:ClassValue[])=>twMerge(clsx(inputs));
// Seller uploads are already resized WebP served by the API, so Next's optimiser is skipped for them.
export const uploaded=(src:string)=>src.startsWith('/api/media/');
