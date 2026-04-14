import { Typography, theme } from 'antd';
import React from 'react';

export function HeroAnimation() {
  const { token } = theme.useToken();
  
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: token.colorBgLayout,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="hero-shape shape-1"
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: `radial-gradient(circle at center, ${token.colorPrimary}40 0%, transparent 70%)`,
          top: '-10%',
          left: '-10%',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="hero-shape shape-2"
        style={{
          position: 'absolute',
          width: '800px',
          height: '800px',
          borderRadius: '50%',
          background: `radial-gradient(circle at center, ${token.colorInfo}30 0%, transparent 70%)`,
          bottom: '-20%',
          right: '-10%',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="hero-shape shape-3"
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: `radial-gradient(circle at center, ${token.colorSuccess}20 0%, transparent 70%)`,
          top: '40%',
          left: '60%',
          filter: 'blur(30px)',
        }}
      />
      
      <div className="hero-text-block" style={{ zIndex: 1, textAlign: 'center', padding: '0 80px', width: '100%', maxWidth: 1200, marginTop: '-15vh' }}>
        <Typography.Title 
          level={1} 
          className="hero-title"
          style={{ 
            fontSize: 'clamp(6rem, 12vw, 14rem)', 
            fontWeight: 900, 
            marginBottom: 24,
            letterSpacing: '-0.02em',
            lineHeight: 1.1
          }}
        >
          1Flowse
        </Typography.Title>
        <Typography.Paragraph 
          className="hero-slogan"
          style={{ 
            fontSize: '1.5rem', 
            fontWeight: 500,
            maxWidth: 600,
            margin: '0 auto'
          }}
        >
          知道为什么构建是构建前提
        </Typography.Paragraph>
      </div>

      <style>
        {`
          .hero-text-block {
            animation: reveal 1.5s cubic-bezier(0.2, 0, 0, 1) forwards;
          }

          .hero-title {
            background: linear-gradient(
              120deg,
              ${token.colorPrimary} 40%,
              rgba(255, 255, 255, 1) 50%,
              rgba(105, 177, 255, 0.9) 60%
            );
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shine 30s linear infinite 1.5s;
          }

          .hero-slogan {
            background: linear-gradient(
              120deg,
              ${token.colorPrimary} 40%,
              rgba(255, 255, 255, 0.9) 50%,
              ${token.colorInfo} 60%
            );
            background-size: 200% auto;
            color: transparent;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shine 30s linear infinite 1.5s;
          }

          @keyframes reveal {
            0% { clip-path: inset(0 100% 0 0); opacity: 0; }
            5% { opacity: 0.1; }
            100% { clip-path: inset(0 0 0 0); opacity: 0.7; }
          }

          @keyframes shine {
            0% { background-position: 200% center; }
            100% { background-position: -200% center; }
          }

          .hero-shape {
            animation: float 20s ease-in-out infinite alternate;
          }
          .shape-1 {
            animation-delay: 0s;
            animation-duration: 25s;
          }
          .shape-2 {
            animation-delay: -5s;
            animation-duration: 30s;
            animation-direction: alternate-reverse;
          }
          .shape-3 {
            animation-delay: -10s;
            animation-duration: 20s;
          }

          @keyframes float {
            0% {
              transform: translate(0, 0) scale(1);
            }
            33% {
              transform: translate(30px, -50px) scale(1.1);
            }
            66% {
              transform: translate(-20px, 20px) scale(0.9);
            }
            100% {
              transform: translate(0, 0) scale(1);
            }
          }
        `}
      </style>
    </div>
  );
}
