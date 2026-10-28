# БЭДТРИП 🌀

**Acid schizo-punk 3D шутер 2×2** с войсом и карточным хаосом. Играбельный билд: слайды, бхоп, голос = газ, абсурдные карты, кислотная графика.

## ▶️ Как играть

```bash
npm install
npm run dev      # локально на http://localhost:5173
npm run build    # прод-сборка в dist/
```

- **WASD** — движение · **SPACE** — прыжок / бхоп · **SHIFT / C** — слайд
- **LMB** — стрельба · **R** — перезарядка · **Q / E / F** — способности · **3 / 4** — активные карты
- **🎤 Голос = газ**: болтай в микрофон — бежишь быстрее (до +35%). Тишина ничего не даёт.
- Режимы: **Тренировка 2×2 против ботов** и **Онлайн-комната** (код комнаты, войс через WebRTC).

## 🧬 Герои

| Герой | Роль | Фишка |
|---|---|---|
| ⚡ ШИЛО | DPS | рывок, криты, ульта «Быстрее мысли» |
| 🍄 СПОРА | саппорт | лечебные споры, грибная стена, «Бэд Трип» |
| 📻 ГОЛОСА | трикстер | клоны, фейковые шаги, «Хор» |
| 🫠 ЖИЖА | танк | кислотные лужи, желе-стены, «Поглощение» |

Карты: апгрейды, мутации способностей, **руины** для врагов («Зеркало», «Шляпа»…) и **хаос** («Обмен телами», «Дождь из жаб»). Дизайн — [docs/game-design.md](docs/game-design.md).

## 🌐 Деплой на GitHub Pages

В репозитории уже есть workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
1. **Settings → Pages → Source: «GitHub Actions»** (один раз включить).
2. Каждый push автоматически собирает и публикует игру на `https://bobrkorolkov-afk.github.io/Coop/`.

## 🏆 Supabase (рекорды)

1. Создай проект на [supabase.com](https://supabase.com), выполни [supabase/setup.sql](supabase/setup.sql) в SQL Editor.
2. Вставь `supabaseUrl` и `supabaseAnonKey` (Project Settings → API) в [public/config.js](public/config.js).
3. Меню «Рекорды» оживает: топ-10 и отправка счёта после матча.

## 🛠 Технологии

Three.js + Vite + TypeScript, физика движения — Quake/Source-модель (слайды, бхоп, air strafe), войс — WebRTC (PeerJS) + Web Audio API, бэкенд — Supabase.
