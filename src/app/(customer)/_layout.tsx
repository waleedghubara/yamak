import { YamakTabs } from '../../components/TabBar';

export default function CustomerTabs() {
  return (
    <YamakTabs
      tabs={[
        { name: 'home', title: 'tabs.home', icon: 'home-variant', iconActive: 'home-variant' },
        { name: 'rides', title: 'tabs.rides', icon: 'history', iconActive: 'history' },
        { name: 'places', title: 'tabs.places', icon: 'bookmark-outline', iconActive: 'bookmark-outline' },
        { name: 'account', title: 'tabs.account', icon: 'account-outline', iconActive: 'account' },
      ]}
    />
  );
}
