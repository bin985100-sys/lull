
import { resetTo } from '@/nav';
import { ListPage } from '@/components/ListPage';
import { useLibrary } from '@/store/library';
import { Btn, Empty } from '@/ui/kit';

export default function Favorites() {
  const liked = useLibrary((s) => s.liked);
  return (
    <ListPage title="Любимые треки" cover={{ collage: liked.map((t) => t.artwork) }} tracks={liked} sub2
      empty={<Empty icon="heart" title="Пока нет любимых треков" text="Нажми на сердце в плеере или в меню трека."><Btn label="Открыть музыку" icon="arrow" onPress={() => resetTo('/discover')} /></Empty>} />
  );
}
