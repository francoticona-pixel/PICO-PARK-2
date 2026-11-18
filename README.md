# Squad Bits — jogo cooperativo 2D

Squad Bits é um jogo original de plataforma e puzzles cooperativos, inspirado no gênero de jogos de equipe em pixel art. Não utiliza código, personagens, mapas ou imagens extraídos de PICO PARK 2.

## Recursos da primeira versão

- Salas privadas com código de 6 caracteres.
- Até 8 jogadores por sala.
- Lobby com lista de jogadores e indicação do criador da sala.
- Movimento e colisões processados no servidor e transmitidos aos jogadores.
- 30 fases com progressão de dificuldade e 6 temas visuais.
- Chave compartilhada e porta de saída: todos os jogadores precisam alcançar a saída.
- Botões que abrem portões, espinhos, serras móveis, raios temporizados, molas, plataformas quebradiças e correias.
- Cenários, personagens e texturas desenhados no Canvas, sem baixar imagens externas.
- Controles de teclado e controles de toque básicos.

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Na raiz do projeto, execute `npm install`.
3. Execute `npm start`.
4. Abra `http://localhost:3000`.

## Publicar no Render

Este repositório já inclui `render.yaml`. No Render, crie um **New Blueprint** e conecte este repositório, ou crie manualmente um **Web Service** com:

- Runtime: Node
- Branch: `main`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Instance Type: Free, se disponível na sua conta.

## Limitações conhecidas da primeira versão

- As salas ficam na memória do processo. Se o serviço reiniciar ou dormir, as salas e partidas ativas são encerradas; será necessário criar uma sala nova.
- Instâncias gratuitas do Render podem suspender o serviço quando ficam sem uso, então a primeira abertura depois de um período parado pode demorar.
- Esta versão ainda precisa de testes de partidas reais com diferentes quantidades de jogadores para ajustar colisões, saltos e dificuldade de cada fase.
- O jogo foi pensado primeiro para navegador em desktop; há controles de toque básicos, mas a jogabilidade em celulares também precisa de testes.

## Estrutura

```text
public/
  client.js
  index.html
  style.css
shared/
  levels.js
package.json
render.yaml
server.js
```
