'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', icon: '📝', label: '記帳' },
  { href: '/accounts', icon: '💳', label: '帳戶' },
  { href: '/summary', icon: '📊', label: '摘要' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav-bottom">
      <div className="nav-bottom-inner">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
