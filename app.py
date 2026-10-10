import os
from http import HTTPStatus
from types import MappingProxyType

import requests
from flask import Flask, jsonify, render_template, request
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LANGUAGES = MappingProxyType({
    "en": "English",
    "kn": "Kannada",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "pt": "Portuguese",
    "ru": "Russian",
})


def create_http_session():
    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )

    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    return session


def create_app():
    app = Flask(__name__)

    app.config.update(
        MAX_TEXT_LENGTH=3000,
        TRANSLATION_URL="https://api.mymemory.translated.net/get",
        CONNECT_TIMEOUT=3,
        READ_TIMEOUT=12,
    )
    app.extensions["translation_session"] = create_http_session()

    @app.get("/")
    def home():
        return render_template("index.html", languages=LANGUAGES)

    @app.post("/translate")
    def translate():
        data = request.get_json(silent=True)

        if not isinstance(data, dict):
            return jsonify(error="Please send a valid JSON request."), HTTPStatus.BAD_REQUEST

        text = data.get("text")
        source_lang = data.get("source_lang", "en")
        target_lang = data.get("target_lang", "kn")

        if not isinstance(text, str) or not (text := text.strip()):
            return jsonify(error="Please enter text to translate."), HTTPStatus.BAD_REQUEST

        if len(text) > app.config["MAX_TEXT_LENGTH"]:
            return jsonify(
                error=f"Please enter fewer than {app.config['MAX_TEXT_LENGTH']} characters."
            ), HTTPStatus.BAD_REQUEST

        if not isinstance(source_lang, str) or not isinstance(target_lang, str):
            return jsonify(error="Please select valid languages."), HTTPStatus.BAD_REQUEST

        source_lang = source_lang.lower()
        target_lang = target_lang.lower()

        if source_lang not in LANGUAGES or target_lang not in LANGUAGES:
            return jsonify(error="Please select valid languages."), HTTPStatus.BAD_REQUEST

        if source_lang == target_lang:
            return jsonify(translated_text=text)

        try:
            session = app.extensions["translation_session"]
            response = session.get(
                app.config["TRANSLATION_URL"],
                params={"q": text, "langpair": f"{source_lang}|{target_lang}"},
                timeout=(app.config["CONNECT_TIMEOUT"], app.config["READ_TIMEOUT"]),
            )
            response.raise_for_status()
            result = response.json()

        except requests.Timeout:
            return jsonify(error="Translation timed out. Please try again."), HTTPStatus.GATEWAY_TIMEOUT
        except (requests.RequestException, ValueError):
            return jsonify(
                error="Unable to reach the translation service. Please try again."
            ), HTTPStatus.BAD_GATEWAY

        translated_text = (
            result.get("responseData", {}).get("translatedText", "").strip()
            if result.get("responseStatus") == HTTPStatus.OK
            else ""
        )

        if not translated_text:
            return jsonify(
                error="The translation service could not process this request."
            ), HTTPStatus.BAD_GATEWAY

        return jsonify(translated_text=translated_text)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "").lower() == "true",
    )