import { YamakTabs } from '../../components/TabBar';

export default function CaptainTabs() {
  return (
    <YamakTabs
      tabs={[
        { name: 'home', title: 'tabs.home', icon: 'home-variant', iconActive: 'home-variant', hideBar: true },
        { name: 'earnings', title: 'tabs.earnings', icon: 'cash', iconActive: 'cash' },
        { name: 'account', title: 'tabs.account', icon: 'account-outline', iconActive: 'account' },
      ]}
    />
  );
}
