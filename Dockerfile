FROM node:12.14.0-alpine

RUN apk update && apk add bash && apk add curl && apk add git

ENV NPM_CONFIG_LOGLEVEL warn

COPY . /usr/src

WORKDIR /usr/src

RUN npm i pm2 -g
RUN yarn install

ENV PATH /usr/src/node_modules/.bin:$PATH

CMD ["bash"]
