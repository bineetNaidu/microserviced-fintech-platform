import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Retrieve token cookie
  const token = request.cookies.get('auth-token')?.value;

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isDashboardRoute = pathname.startsWith('/dashboard');

  // If trying to access dashboard routes without token, redirect to login
  if (isDashboardRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If logged in and hitting login/register pages, redirect to dashboard overview
  if (isAuthRoute && token) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

// Map the paths that this middleware should run against
export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
