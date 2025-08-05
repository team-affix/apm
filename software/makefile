propagate-common:
	cd common && \
	npm version patch && \
	npm publish
	
	cd server && \
	npm install @team-affix/apm-common@latest && \
	npm version patch && \
	npm publish

	cd client && \
	npm install @team-affix/apm-common@latest && \
	npm install @team-affix/apm-server@latest && \
	npm version patch && \
	npm publish

propagate-server:
	cd server && \
	npm version patch && \
	npm publish

	cd client && \
	npm install @team-affix/apm-server@latest && \
	npm version patch && \
	npm publish
