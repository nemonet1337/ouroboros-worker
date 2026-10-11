FROM node:24-alpine

WORKDIR /app

# 依存関係。npm start は tsx を使うので devDependencies も入れる
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# GUI のスタイル（Tailwind）をビルドする。public/assets にもコピーされる
RUN npm run build:css

# 既定の DB は docker-compose が別コンテナの rqlite（HTTP サービス）へ向ける
# （OURO_DB=rqlite / OURO_RQLITE_URL=http://db:4001）。
# 未設定なら node:sqlite でプロセス内臓に動き、./data に SQLite ファイルを置く。
EXPOSE 3000

CMD ["npm", "start"]
