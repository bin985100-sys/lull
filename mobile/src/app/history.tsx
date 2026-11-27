import { resetTo } from '@/nav';
import { useMemo } from 'react';
import { historyRows } from '@/store/history-view';

import { TrackRow } from '@/components/TrackRow';
import { useLibrary } from '@/store/library';
import { Btn, Empty, IconBtn, Screen, ScreenList, T, TopBar } from '@/ui/kit';
import { confirm, toast } from '@/ui/overlay';

export default function History() {
  const h = useLibrary((s) => s.history);
  const save = useLibrary((s) => s.settings.saveHistory);
  const rows=useMemo(()=>historyRows(h),[h]);
  if (!h.length) return (
    <Screen><TopBar title="История" />
      <Empty icon="clock" title="История пуста" text={save ? 'Здесь появится то, что ты слушал.' : 'Сохранение истории выключено в настройках.'}>
        <Btn label="Открыть музыку" icon="arrow" onPress={() => resetTo('/discover')} />
      </Empty>
    </Screen>
  );
  return <ScreenList testID="history-list" data={rows} keyExtractor={item=>item.key} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} updateCellsBatchingPeriod={32} removeClippedSubviews={false}
    ListHeaderComponent={<TopBar title="История" right={<IconBtn name="eraser" label="Очистить историю" onPress={() => confirm({ icon: 'eraser', title: 'Очистить историю?', text: 'Любимые треки и плейлисты останутся.', safe: 'Отмена', danger: 'Очистить историю', onDanger: () => { useLibrary.getState().clearHistory(); toast('История очищена', 'check'); } })} />} />}
    renderItem={({item})=>item.kind==='heading'?<T v="h2" style={{marginTop:22,marginBottom:10}}>{item.title}</T>:<TrackRow track={item.track} list={item.list} sub noWarm/>}/>;
}
